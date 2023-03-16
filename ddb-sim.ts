import { RingBuffer } from 'ring-buffer-ts';
import { BurstBuckets } from './burst-bucket'

function initCircularBuffer(capacity, default_value) {
    let buf = new RingBuffer<number>(capacity)
    for (let i=0; i<capacity; i++) {
        buf.add(default_value)
    }
    return buf
}

type TableCapacityConfig {
    min: number
    max: number
    target: number
}

class TableCapacity {
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
        if (amount_remaining < 0) {
            // CONSUME FROM BURST IF WE CAN
            const amount_over = amount_remaining * -1
            const burst_consumed = min(amount_over, this.burst_buckets.sum())
            this.burst_buckets.consume(burst_consumed)
            const amount_remaining_after_burst_consumed = amount_over - burst_consumed
        
            if (amount_remaining_after_burst_consumed > 0) {
                // THROTTLE REQUEST
                this.throttled_timestamps.push(timestamp)
            }
        }
        else {
            // ADD UNUSED CAPACITY TO BURST
            this.burst_buckets.add(amount_remaining)
        }


        // TRACK CURRENT UTILIZATION
        const current_utilization = amount_requested / this.capacity
        this.past_utilizations.add(current_utilization)
        

        // HANDLE SCALING UP OR DOWN
        // NOTE: assumes scaling is instantly effective (no delay)
        const last_two_mins_of_util = this.past_utilizations.toArray().slice(-2)
        if (last_two_mins_of_util[0] > this.config.target && last_two_mins_of_util[1] > this.config.target) {
            // scale up
            this.capacity += amount_requested * this.config.target
        }
        
        const scale_down_threshold = this.config.target - this.config.target * 0.20
        if (this.past_utilizations.toArray().every(u => u < scale_down_threshold)) {
            // scale down
            this.capacity -= amount_requested * this.config.target
        }
    }
}

