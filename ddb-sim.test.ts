import {describe, expect, test} from '@jest/globals';
import { table } from 'console';
import { RingBuffer } from 'ring-buffer-ts';
import { BurstBuckets } from './burst-bucket';
import { TableCapacity, TableCapacityConfig } from './ddb-sim';

describe('TableCapacity', () => {
    it('should initialize with correct properties', () => {
        const config = { min: 100, max: 1000, target: 0.5 };
        const tableCapacity = new TableCapacity(config);

        expect(tableCapacity.config).toBe(config);
        expect(tableCapacity.capacity).toBe(config.min);
        expect(tableCapacity.burst_buckets).toBeInstanceOf(BurstBuckets);
        expect(tableCapacity.past_utilizations).toBeInstanceOf(RingBuffer);
        expect(tableCapacity.throttled_timestamps).toHaveLength(0);
    });
    
    describe('process', () => {
        it('should keep last 5 ticks of unused capacity as burst', () => {
            const config = { min: 100, max: 1000, target: 0.5 };
            const tableCapacity = new TableCapacity(config);
            const timestamp = Date.now();
            tableCapacity.capacity = 100

            expect(tableCapacity.burst_buckets.sum()).toEqual(0)

            // at each tick, we add unusused burst, then the table might scale up/down

            // tick 1
            expect(tableCapacity.capacity).toEqual(100)
            tableCapacity.process(timestamp, 30);
            expect(tableCapacity.burst_buckets.sum()).toEqual(70)

            // tick 2
            expect(tableCapacity.capacity).toEqual(100)
            tableCapacity.process(timestamp, 20);
            expect(tableCapacity.burst_buckets.sum()).toEqual(150)

            // tick 3
            expect(tableCapacity.capacity).toEqual(100)
            tableCapacity.process(timestamp, 100);
            expect(tableCapacity.burst_buckets.sum()).toEqual(150)

            // tick 4
            expect(tableCapacity.capacity).toEqual(100)
            tableCapacity.process(timestamp, 80);
            expect(tableCapacity.burst_buckets.sum()).toEqual(170)

            // tick 5
            expect(tableCapacity.capacity).toEqual(160) // scaled up after prev request
            tableCapacity.process(timestamp, 100);
            expect(tableCapacity.burst_buckets.sum()).toEqual(230)

            // at tick 6, tick 1's 70 should fall off
            expect(tableCapacity.capacity).toEqual(200) // scaled up again after prev request
            tableCapacity.process(timestamp, 200);
            expect(tableCapacity.burst_buckets.sum()).toEqual(160)
        });
        
        it('should consume from burst and throttle when capacity is not enough', () => {
            const config = { min: 100, max: 1000, target: 0.5 };
            const tableCapacity = new TableCapacity(config);

            const timestamp = Date.now();
            const amount_requested = 200;
            
            const { consumedCapacity, throttled } = tableCapacity.process(timestamp, amount_requested);
            
            expect(tableCapacity.burst_buckets.sum()).toBe(0);
            expect(throttled).toBe(100)
        });
        it('returns the amount of capacity consumed and the amount of throttled requests', () => {
            const config = { min: 100, max: 1000, target: 0.5 };
            const tableCapacity = new TableCapacity(config);
            tableCapacity.capacity = 100;

            const timestamp = Date.now();
            const amount_requested = 150;
            
            const { consumedCapacity, throttled } = tableCapacity.process(timestamp, amount_requested);

            // request 150, capacity 100, so...
            expect(consumedCapacity).toEqual(100); 
            expect(throttled).toEqual(50); 
        });

        
        it('should only scale up after two consecutive ticks over threshold', () => {
            const config = { min: 100, max: 1000, target: 0.5 };
            const tableCapacity = new TableCapacity(config);
            
            const timestamp = Date.now();
            const amount_requested = 100
            
            // first tick, no change
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(100);
            
            // second tick, should scale up
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(200); // 200 is twice the capacity requested (100) and we have a target util of 0.5
        });
        
        it('should only scale down after 15 consecutive ticks where the utilization is 20% lower than the target', () => {
            const config = { min: 100, max: 1000, target: 0.5 };
            const tableCapacity = new TableCapacity(config);
            const initial_capacity = 200
            tableCapacity.capacity = initial_capacity // overriding capacity to 200 before we start lowball requests
            
            const timestamp = Date.now();
            const amount_requested = 79
            
            // TODO: figure out why we need to do only one process here at init cap first...
            tableCapacity.process(timestamp, 200);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            
            // 14 requests at 20% lower than value at target util, no scale down yet...
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            
            // 15th tick of consecutively 20% than target threshold will adjust capacity lower
            tableCapacity.process(timestamp, amount_requested);
            expect(tableCapacity.capacity).toEqual(160.5);
        });
    });
});
