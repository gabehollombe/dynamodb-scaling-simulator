import { TableCapacity } from './ddb-sim';
import { plot, Plot } from 'nodeplotlib';
import fs from 'fs';
import { parse } from 'csv-parse';

type DataRow = {
    timestamp: Date;
    consumedRead: number;
    consumedWrite: number;
    throttledReads: number;
    throttledWrites: number
}

const processFile = async () => {
  let records: DataRow[] = [];
  const parser = fs
    .createReadStream(`${__dirname}/data.csv`)
    .pipe(parse({
     from_line: 6, // first 5 lines are meta data and headers
    }));
  for await (let r of parser) {
    // cols are: datetime, provisioned read avg, consumed read, provisioned write avg, consumed write, read throttles, write throttles
    const timestamp = r[0].replace(/\//g, "-",).replace(" ", "T").replace(/00$/, "00.000Z")
    records.push({
        timestamp: new Date(Date.parse(timestamp)),
        consumedRead: Math.round(parseFloat(r[2])),
        consumedWrite: Math.round(r[4]),
        throttledReads: Math.round(r[5]),
        throttledWrites: Math.round(r[6])
    })
  }
  return records
};

async function main() {
    const records = await processFile()

    const capSim = new TableCapacity({min: 5, max: 400, target: 0.5})

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
