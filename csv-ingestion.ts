import { SimTimestepInput } from "./plotting";

function round(s: string): number {
    if (s == ''){
        return 0
    }
    else {
        return Math.round(parseFloat(s))
    }
}

export function csvRowToMetrics(r: string[]) {
    // cols are: datetime, provisioned read avg, consumed read, provisioned write avg, consumed write, read throttles, write throttles
    const timestamp = r[0].replace(/\//g, "-",).replace(" ", "T").replace(/00$/, "00.000Z")
    return {
        timestamp: new Date(Date.parse(timestamp)),
        provisionedRead: round(r[1]),
        consumedRead: round(r[2]),
        provisionedWrite: round(r[3]),
        consumedWrite: round(r[4]),
        throttledReads: round(r[5]),
        throttledWrites: round(r[6])
    }
}

export function arrayToMetricsRecords(arr: string[][]): { timestamp: Date; provisionedRead: number; consumedRead: number; provisionedWrite: number; consumedWrite: number; throttledReads: number; throttledWrites: number }[] {
    return arr.map(csvRowToMetrics)
}

export function makeRecordsForSimulator(records: any[]): { readRecords: SimTimestepInput[], writeRecords: SimTimestepInput[] } {
    const readRecords = records.map(r => { return { timestamp: r.timestamp, consumed: r.consumedRead, throttled: r.throttledReads } })
    const writeRecords = records.map(r => { return { timestamp: r.timestamp, consumed: r.consumedWrite, throttled: r.throttledWrites } })
    return { readRecords, writeRecords }
}