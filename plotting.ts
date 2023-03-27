import { TableCapacity, TableCapacityConfig } from './ddb-sim';

export type Trace = {
    x: string[]
    y: number[]
    type: string
    name: string 
}

export type SimTimestepInput = { 
    timestamp: Date, 
    consumed: number, 
    throttled: number, 
}


export function getTraces(config: TableCapacityConfig, records: SimTimestepInput[]) {
    const capSim = new TableCapacity(config)

    let timeXs: string[] = []
    let provisionedCapacityTraceYs: number[] = []
    let consumedCapacityTraceYs: number[] = []
    let throttledCapacityTraceYs: number[] = []
    let burstAvailableTraceYs: number[] = []

    for (let i=0; i<records.length; i++) {
        const record = records[i]
        const timestamp = records[i].timestamp
        const totalRequested = Math.round((record.consumed + record.throttled) / 60)

        timeXs.push(timestamp.toISOString())
        provisionedCapacityTraceYs.push(capSim.capacity)

        const { consumedCapacity, throttled, burstAvailable } = capSim.process(timestamp.getTime(), totalRequested)
        consumedCapacityTraceYs.push(consumedCapacity)
        throttledCapacityTraceYs.push(throttled)
        burstAvailableTraceYs.push(burstAvailable)
    }

    const provisionedCapacityTrace = {
        x: timeXs,
        y: provisionedCapacityTraceYs,
        type: 'scatter',
        name: 'Provisioned',
    }

    const consumedCapacityTrace = {
        x: timeXs,
        y: consumedCapacityTraceYs,
        type: 'scatter',
        name: 'Consumed',
    }

    const throttledCapacityTrace = {
        x: timeXs,
        y: throttledCapacityTraceYs,
        type: 'scatter',
        name: 'Throttled',
    }

    const burstAvailableTrace = {
        x: timeXs,
        y: burstAvailableTraceYs,
        type: 'scatter',
        name: 'Burst Available',
    }

    return { provisionedCapacityTrace, consumedCapacityTrace, throttledCapacityTrace, burstAvailableTrace }
}