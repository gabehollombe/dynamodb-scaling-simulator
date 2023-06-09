import { RingBuffer } from 'ring-buffer-ts';
import { BurstBuckets } from './burst-bucket'
import dayjs from 'dayjs'

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
    scaling_delay_in_seconds: number
}

export class TableCapacity {
    config: TableCapacityConfig
    capacity: number
    burst_buckets: BurstBuckets
    past_utilizations: RingBuffer<number>
    throttled_timestamps: number[]
    last_process_at: number
    capacity_change_at: number
    capacity_change_to: number
    first_scaledown_happened_at: number
    scaledowns_remaining_in_first_batch: number;
    first_scaledown_batch_ends_at: number;
    most_recent_scaledown_happened_at: number;

    constructor(config:TableCapacityConfig) {
        this.config = config
        this.capacity = config.min
        this.burst_buckets = new BurstBuckets(5)
        this.past_utilizations = initCircularBuffer(15, 0)
        this.throttled_timestamps = []
        this.last_process_at = -1
        this.capacity_change_at = -1
        this.capacity_change_to = -1
        this.first_scaledown_happened_at = -1
        this.scaledowns_remaining_in_first_batch = 4 // TODO make this configurable
        this.first_scaledown_batch_ends_at = -1
        this.most_recent_scaledown_happened_at = -1
    }

    resetScaledownTracking() {
        this.first_scaledown_happened_at = -1
        this.first_scaledown_batch_ends_at = -1
        this.most_recent_scaledown_happened_at = -1
        this.scaledowns_remaining_in_first_batch = 4
    }

    canScaleDown(timestamp: number): boolean {
        // If we have not scaled down this day yet, we can scaledown
        if (this.first_scaledown_happened_at == -1) {
            return true
        }

        // If timestamp is inside first batch window and we have any scaledowns remaining in the first batch (defaults to 60 minutes after first scaledown of the day), we can scaledown
        if (timestamp < this.first_scaledown_batch_ends_at && this.scaledowns_remaining_in_first_batch > 0) {
            return true
        }

        // Othwerwise, we can only scaledown if it has been long enough (default 60 minutes) since last scaledown
        // TODO make the 60 minutes configurable
        if (timestamp >= dayjs(this.most_recent_scaledown_happened_at).add(60, 'minutes').valueOf()) {
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


        // track utilization
        const current_utilization = amount_requested / this.capacity
        this.past_utilizations.add(current_utilization)
        

        // handle scheduling a scaling event after some delay
        if (this.capacity_change_at == -1) {
            const last_two_mins_of_util = this.past_utilizations.toArray().slice(-2)
            if (last_two_mins_of_util[0] > 0 && last_two_mins_of_util[1] > 0 && last_two_mins_of_util[0] > this.config.target && last_two_mins_of_util[1] > this.config.target) {
                // scaling up...
                this.capacity_change_to = amount_requested / this.config.target
                // clamp to max value since this is a scale up
                this.capacity_change_to = Math.min(this.config.max, this.capacity_change_to)
            }
            
            const scale_down_threshold = this.config.target - .20
            if (this.past_utilizations.toArray().every(u => u < scale_down_threshold) && this.canScaleDown(timestamp)) {
                // scaling down...
                const hour = dayjs(timestamp).hour()
                this.capacity_change_to = amount_requested / this.config.target
                // clamp to min value since this is a scale down
                this.capacity_change_to = Math.max(this.config.min, this.capacity_change_to)
            }

            if (this.capacity_change_to !== -1) {
                this.capacity_change_at = dayjs(timestamp).add(this.config.scaling_delay_in_seconds, 'seconds').valueOf()
            }
        }

        // handle 'realizing' the scaling event if delay is over
        if (this.capacity_change_at != -1 && timestamp >= this.capacity_change_at) {
            // if this is a scale down, log it
            if (this.capacity_change_to < this.capacity) {
                if (this.first_scaledown_happened_at == -1) {
                    this.first_scaledown_happened_at = timestamp
                    this.first_scaledown_batch_ends_at = dayjs(timestamp).add(60, 'minutes').valueOf()
                }
                if (timestamp < this.first_scaledown_batch_ends_at && this.scaledowns_remaining_in_first_batch > 0) {
                    this.scaledowns_remaining_in_first_batch -= 1
                }
                this.most_recent_scaledown_happened_at = timestamp
            }

            // we round capacity so we don't get super nasty floating point math inequalities when consuming burst
            this.capacity = Math.round(this.capacity_change_to) 
            this.capacity_change_at = -1
            this.capacity_change_to = -1
        }


        this.last_process_at = timestamp
        return { consumedCapacity, throttled, burstAvailable: this.burst_buckets.sum()  }
    }
}

