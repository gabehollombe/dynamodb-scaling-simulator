import { plot, Plot } from 'nodeplotlib';
import fs from 'fs';
import { parse } from 'csv-parse';
import { Record, getTraces } from './plotting'

const processFileNode = async (csvFilePath: string) => {
  let records: Record[] = [];
  const parser = fs
    .createReadStream(csvFilePath)
    .pipe(parse({
     from_line: 6, // first 5 lines are meta data and headers
    }));
  for await (let r of parser) {
    // cols are: datetime, provisioned read avg, consumed read, provisioned write avg, consumed write, read throttles, write throttles
    const timestamp = r[0].replace(/\//g, "-",).replace(" ", "T").replace(/00$/, "00.000Z")
    records.push({
        timestamp: new Date(Date.parse(timestamp)),
        consumedRead: Math.round(r[2]),
        consumedWrite: Math.round(r[4]),
        throttledReads: Math.round(r[5]),
        throttledWrites: Math.round(r[6])
    })
  }
  return records
};

async function main() {
    const records = await processFileNode(`${__dirname}/data.csv`)
    const traces = getTraces({
        min: 5, 
        max: 400, 
        target: 0.5, 
        scaling_delay_in_seconds: 1*60
    }, records)

    const layout = {
        width: 2000,
    }

    plot([
        traces.provisionedCapacityTrace as Plot,
        traces.consumedCapacityTrace as Plot,
        traces.throttledCapacityTrace as Plot,
        traces.burstAvailableTrace as Plot,
    ], layout);
}

main()
