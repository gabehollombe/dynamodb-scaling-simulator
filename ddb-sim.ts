import { RingBuffer } from 'ring-buffer-ts';
import { BurstBuckets } from './burst-bucket'
import * as dayjs from 'dayjs'
import { time } from 'console';

function initCircularBuffer(capacity: number, default_value: number) {
    let buf = new RingBuffer<number>(capacity)
    for (let i=0; i<capacity; i++) {
        buf.add(default_value)
    }
    return buf
}

export type TableCapacityConfig = {
    min: number
    max: number
    target: number
}

export class TableCapacity {
    config: TableCapacityConfig
    capacity: number
    burst_buckets: BurstBuckets
    past_utilizations: RingBuffer<number>
    throttled_timestamps: number[]
    first_scaledown_hour: number
    scaledowns_per_hour: number[]
    last_process_at: number

    constructor(config:TableCapacityConfig) {
        this.config = config
        this.capacity = config.min
        this.burst_buckets = new BurstBuckets(5)
        this.past_utilizations = initCircularBuffer(15, 0)
        this.throttled_timestamps = []
        this.first_scaledown_hour = -1
        this.last_process_at = -1
        this.resetScaledownTracking()
    }

    resetScaledownTracking() {
        this.first_scaledown_hour = -1
        this.scaledowns_per_hour = [
            0, 0, 0, 0, 0, 0, 
            0, 0, 0, 0, 0, 0, 
            0, 0, 0, 0, 0, 0, 
            0, 0, 0, 0, 0, 0
        ] // 24 hours
    }

    canScaleDown(timestamp: number): boolean {
        if (this.first_scaledown_hour == -1) {
            return true
        }
        const hour = dayjs(timestamp).hour()

        if (hour == this.first_scaledown_hour && this.scaledowns_per_hour[hour] <= 3) {
            return true
        }
        else if (this.scaledowns_per_hour[hour] == 0) {
            return true
        }

        return false
    }

    process(timestamp: number, amount_requested: number) {
        if (dayjs(timestamp).date() !== dayjs(this.last_process_at).date()) {
            this.resetScaledownTracking()
        }

        const amount_remaining = this.capacity - amount_requested
        let consumedCapacity = 0
        let throttled = 0
        if (amount_remaining < 0) {
            consumedCapacity += this.capacity

            // CONSUME FROM BURST IF WE CAN
            const amount_over = amount_remaining * -1
            const burst_consumed = Math.min(amount_over, this.burst_buckets.sum())
            this.burst_buckets.consume(burst_consumed)
            consumedCapacity += burst_consumed

            const amount_remaining_after_burst_consumed = amount_over - burst_consumed
            if (amount_remaining_after_burst_consumed > 0) {
                // THROTTLE THE REST AFTER NO BURST LEFT
                throttled = amount_remaining_after_burst_consumed
            }
        }
        else {
            // ADD UNUSED CAPACITY TO BURST
            this.burst_buckets.add(amount_remaining)
            consumedCapacity += amount_requested
        }


        // TRACK CURRENT UTILIZATION
        const current_utilization = amount_requested / this.capacity
        this.past_utilizations.add(current_utilization)
        

        // HANDLE SCALING UP OR DOWN
        // NOTE: assumes scaling is instantly effective (no delay)
        const last_two_mins_of_util = this.past_utilizations.toArray().slice(-2)
        if (last_two_mins_of_util[0] > 0 && last_two_mins_of_util[1] > 0 && last_two_mins_of_util[0] > this.config.target && last_two_mins_of_util[1] > this.config.target) {
            // scaling up...
            this.capacity = amount_requested / this.config.target
            // clamp to max value since this is a scale up
            this.capacity = Math.min(this.config.max, this.capacity)
        }
        
        const scale_down_threshold = this.config.target - .20
        if (this.past_utilizations.toArray().every(u => u < scale_down_threshold) && this.canScaleDown(timestamp)) {
            // scaling down...
            const hour = dayjs(timestamp).hour()
            if (this.first_scaledown_hour == -1) {
                this.first_scaledown_hour = hour
            }
            this.scaledowns_per_hour[hour] = this.scaledowns_per_hour[hour] + 1
            this.capacity = amount_requested / this.config.target
            // clamp to min value since this is a scale down
            this.capacity = Math.max(this.config.min, this.capacity)
        }

        // BE SURE TO ROUND CAPACITY SO WE DON'T GET SUPER NASTY FLOATING POINT MATH INEQUALITIES WHEN CONSUMING BURST
        this.capacity = Math.round(this.capacity)

        this.last_process_at = timestamp
        return { consumedCapacity, throttled, burstAvailable: this.burst_buckets.sum()  }
    }
}

