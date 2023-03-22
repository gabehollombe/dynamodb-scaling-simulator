import { fetchTableMetrics } from './table-consumption-fetcher'
import { TableCapacity } from './ddb-sim';
import { plot, Plot } from 'nodeplotlib';

async function main() {
    const startTime = new Date(Date.parse('2023-01-02T00:00:00.000Z'))
    const endTime =   new Date(Date.parse('2023-01-03T00:00:00.000Z'))
    const stats = await fetchTableMetrics({
        profile: 'some_profile_name', // from ~/.aws/credentials
        region: 'eu-central-1',
        tableName: 'my-table-name',  // your ddb table name
        startTime,
        endTime,
    })

    // set your min, max, and target util here, as well as how long before scaling takes effect after it is triggered
    const capSim = new TableCapacity({min: 5000, max: 15000, target: 0.7, scaling_delay_in_seconds: 2*60})

    let timeXs: Date[] = []
    let provisionedCapacityTraceYs: number[] = []
    let consumedCapacityTraceYs: number[] = []
    let throttledCapacityTraceYs: number[] = []
    let burstAvailableTraceYs: number[] = []

    for (let i=0; i<stats.length; i++) {
        const { timestamp, consumedRead, consumedWrite, throttledReads, throttledWrites  } = stats[i]
        const totalRequested = consumedRead + throttledReads

        timeXs.push(timestamp)
        provisionedCapacityTraceYs.push(capSim.capacity)

        const { consumedCapacity, throttled, burstAvailable } = capSim.process(timestamp.getTime(), totalRequested)
        consumedCapacityTraceYs.push(consumedCapacity)
        throttledCapacityTraceYs.push(throttled)
        burstAvailableTraceYs.push(burstAvailable)
    }

    const provisionedCapacityTrace: Plot = {
        x: timeXs,
        y: provisionedCapacityTraceYs,
        type: 'scatter',
        name: 'Provisioned',
    }

    const consumedCapacityTrace: Plot = {
        x: timeXs,
        y: consumedCapacityTraceYs,
        type: 'scatter',
        name: 'Consumed',
    }

    const throttledCapacityTrace: Plot = {
        x: timeXs,
        y: throttledCapacityTraceYs,
        type: 'scatter',
        name: 'Throttled',
    }

    const burstAvailableTrace: Plot = {
        x: timeXs,
        y: burstAvailableTraceYs,
        type: 'scatter',
        name: 'Burst Available',
    }

    const layout = {
        width: 2000,
    }

    plot([provisionedCapacityTrace, consumedCapacityTrace, throttledCapacityTrace, burstAvailableTrace], layout);
}

main()
