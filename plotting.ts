import { TableCapacity, TableCapacityConfig } from './ddb-sim';

export type Record = { 
    timestamp: Date, 
    consumedRead: number, 
    consumedWrite: number, 
    throttledReads: number, 
    throttledWrites: number
}

export function getTraces(config: TableCapacityConfig, records: Record[]) {
    const capSim = new TableCapacity(config)

    let timeXs: Date[] = []
    let provisionedCapacityTraceYs: number[] = []
    let consumedCapacityTraceYs: number[] = []
    let throttledCapacityTraceYs: number[] = []
    let burstAvailableTraceYs: number[] = []

    for (let i=0; i<records.length; i++) {
        const { timestamp, consumedRead, consumedWrite, throttledReads, throttledWrites  } = records[i]
        const totalRequested = Math.round((consumedRead + throttledReads) / 60)

        timeXs.push(timestamp)
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