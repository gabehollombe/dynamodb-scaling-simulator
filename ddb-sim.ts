import { RingBuffer } from 'ring-buffer-ts';
import { BurstBuckets } from './burst-bucket'

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
    config: TableCapacityConfig;
    capacity: number;
    burst_buckets: BurstBuckets;
    past_utilizations: RingBuffer<number>;
    throttled_timestamps: number[];

    constructor(config:TableCapacityConfig) {
        this.config = config
        this.capacity = config.min
        this.burst_buckets = new BurstBuckets(5)
        this.past_utilizations = initCircularBuffer(15, 0)
        this.throttled_timestamps = []
    }


    process(timestamp: number, amount_requested: number) {
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
            // scale up
            this.capacity = amount_requested / this.config.target // dividing by decimal between 0 and 1 will cause us to make our new utilization equal to the target
            // clamp to max value
            this.capacity = Math.min(this.config.max, this.capacity)
        }
        
        const scale_down_threshold = this.config.target - this.config.target * 0.20
        if (this.past_utilizations.toArray().every(u => u < scale_down_threshold)) {
            // scale down
            this.capacity -= amount_requested * this.config.target
            // clamp to min value
            this.capacity = Math.max(this.config.min, this.capacity)
        }

        return { consumedCapacity, throttled  }
    }
}

