import {describe, expect, test} from '@jest/globals';
import { RingBuffer } from 'ring-buffer-ts';
import { BurstBuckets } from './burst-bucket';
import { TableCapacity, TableCapacityConfig } from './ddb-sim';
import dayjs from 'dayjs'

describe('TableCapacity', () => {
    it('should initialize with correct properties', () => {
        const config = { min: 100, max: 1000, target: 0.5, scaling_delay_in_seconds: 0 };
        const tableCapacity = new TableCapacity(config);

        expect(tableCapacity.config).toBe(config);
        expect(tableCapacity.capacity).toBe(config.min);
        expect(tableCapacity.burst_buckets).toBeInstanceOf(BurstBuckets);
        expect(tableCapacity.past_utilizations).toBeInstanceOf(RingBuffer);
        expect(tableCapacity.throttled_timestamps).toHaveLength(0);
    });
    
    describe('process', () => {
        it('should keep last 5 ticks of unused capacity as burst', () => {
            const config = { min: 100, max: 1000, target: 0.5, scaling_delay_in_seconds: 0 };
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
            const config = { min: 100, max: 1000, target: 0.5, scaling_delay_in_seconds: 0 };
            const tableCapacity = new TableCapacity(config);

            const timestamp = Date.now();
            const amount_requested = 200;
            
            const { consumedCapacity, throttled } = tableCapacity.process(timestamp, amount_requested);
            
            expect(tableCapacity.burst_buckets.sum()).toBe(0);
            expect(throttled).toBe(100)
        });
        it('returns the amount of capacity consumed and the amount of throttled requests and the burst available', () => {
            const config = { min: 100, max: 1000, target: 0.5, scaling_delay_in_seconds: 0 };
            const tableCapacity = new TableCapacity(config);
            tableCapacity.capacity = 100;
            const timestamp = Date.now();
            let results

            results = tableCapacity.process(timestamp, 150);
            // request 150, capacity 100, so...
            expect(results.consumedCapacity).toEqual(100); 
            expect(results.throttled).toEqual(50); 
            expect(results.burstAvailable).toEqual(0); 

            results = tableCapacity.process(timestamp, 20);
            expect(results.consumedCapacity).toEqual(20); 
            expect(results.throttled).toEqual(0); 
            expect(results.burstAvailable).toEqual(80); 
        });
        
        it('should only scale up after two consecutive ticks over threshold', () => {
            const config = { min: 100, max: 1000, target: 0.5, scaling_delay_in_seconds: 0 };
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
            const config = { min: 100, max: 1000, target: 0.5, scaling_delay_in_seconds: 0 };
            const tableCapacity = new TableCapacity(config);
            const initial_capacity = 200
            tableCapacity.capacity = initial_capacity // overriding capacity to 200 before we start lowball requests
            
            const timestamp = Date.now();
            const amount_requested = 50
            
            // start us off with something that wouldn't trigger a scale down because at the beginning all 15 past utilization slots are 0...
            tableCapacity.process(timestamp, 200);
            expect(tableCapacity.capacity).toEqual(initial_capacity);
            
            // 14 more requests at 20% lower than value at target util, no scale down yet...
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
            expect(tableCapacity.capacity).toEqual(100); // We round capacity when we scale
        });

        it('does not scale down more than 27 times in a 24 hour period beginning at 00:00:00.000Z (4 in first hour that downscaling begins, one per additional hour)', () => {
            const config = { min: 10, max: 1000, target: 0.5, scaling_delay_in_seconds: 0 };
            const tableCapacity = new TableCapacity(config);
            const initial_capacity = 400
            tableCapacity.capacity = initial_capacity
            let datetime = dayjs('2000-01-02T00:00:00.000Z')

            expect(tableCapacity.capacity).toEqual(400);
            tableCapacity.process(datetime.valueOf(), 200); // right on target
            datetime = datetime.add(1, 'minute')

            tableCapacity.capacity = initial_capacity
            expect(tableCapacity.capacity).toEqual(400);
            tableCapacity.process(datetime.valueOf(), 200);
            datetime = datetime.add(1, 'minute')

            // let's wait a few hours, then try to trigger first downscale...
            for (let minute=1; minute<=4*60; minute++) {
                expect(tableCapacity.capacity).toEqual(400);
                datetime = datetime.add(1, 'minute')
                tableCapacity.process(datetime.valueOf(), 200);
            }

            // trigger first downscale
            let scaledownReq = tableCapacity.capacity * (tableCapacity.config.target - .22)
            for (let minute=1; minute<=15; minute++) {
                expect(tableCapacity.capacity).toEqual(400);
                datetime = datetime.add(1, 'minute')
                tableCapacity.process(datetime.valueOf(), scaledownReq); // more than .5 lower than 200
            }

            // first scale down should have happened
            expect(tableCapacity.capacity).toEqual(224);

            // figure out what hour of the day we are in and assert that only 3 more downscales will happen in this hour
            const firstScaledownEventHour = dayjs(datetime).hour()
            const firstScaledownEventMinute = dayjs(datetime).minute()

            // trigger 3 more downscales
            for (let minute=1; minute<=3; minute++) {
                let scaledownReq = tableCapacity.capacity * (tableCapacity.config.target - .22)
                let capacityBefore = tableCapacity.capacity
                datetime = datetime.add(1, 'minute')
                tableCapacity.process(datetime.valueOf(), scaledownReq);
                let capacityAfter = tableCapacity.capacity
                expect(capacityAfter).toBeLessThan(capacityBefore)
            }
            
            // for our next minute, we should still be in the same hour so we can test no downscale
            datetime = datetime.add(1, 'minute')
            expect(dayjs(datetime).hour()).toEqual(firstScaledownEventHour)

            // this scaledown req should not trigger a scale down because we already did 4 in first hour
            scaledownReq = tableCapacity.capacity * (tableCapacity.config.target - .22)
            let capacityBefore = tableCapacity.capacity
            datetime = datetime.add(1, 'minute')
            tableCapacity.process(datetime.valueOf(), scaledownReq);
            let capacityAfter = tableCapacity.capacity
            expect(capacityAfter).toEqual(capacityBefore)

            // advance to the next hour...
            while (datetime.hour() == firstScaledownEventHour && datetime.minute() < 59) {
                scaledownReq = tableCapacity.capacity * (tableCapacity.config.target - .22)
                let capacityBefore = tableCapacity.capacity
                datetime = datetime.add(1, 'minute')
                tableCapacity.process(datetime.valueOf(), scaledownReq);
                let capacityAfter = tableCapacity.capacity
                expect(capacityAfter).toEqual(capacityBefore)
            }

            // first request in next hour should downscale only once
            scaledownReq = tableCapacity.capacity * (tableCapacity.config.target - .22)
            capacityBefore = tableCapacity.capacity
            datetime = datetime.add(1, 'minute')
            tableCapacity.process(datetime.valueOf(), scaledownReq);
            capacityAfter = tableCapacity.capacity
            expect(capacityAfter).toBeLessThan(capacityBefore)

            // next request in same hour should not downscale
            scaledownReq = tableCapacity.capacity * (tableCapacity.config.target - .22)
            capacityBefore = tableCapacity.capacity
            datetime = datetime.add(1, 'minute')
            tableCapacity.process(datetime.valueOf(), scaledownReq);
            capacityAfter = tableCapacity.capacity
            expect(capacityAfter).toEqual(capacityBefore)

        });
    });
});
