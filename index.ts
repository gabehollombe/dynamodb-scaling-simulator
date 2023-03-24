import { getCloudWatchUrl } from './cloudwatch-opener'
import { getTraces, SimTimestepInput } from './plotting'
import { newPlot } from 'plotly.js-dist'
import dayjs from 'dayjs'

type Trace = {
    x: string[]
    y: number[]
    type: string
    name: string 
}

function getCloudwatchMetrics(region: string, tableName: string) {
    const url = getCloudWatchUrl(region, tableName)
    window.open(url)
}

function onCsvFileReady(formData: FormData, e) {
    const text = e.target!.result;
    const { readRecords, writeRecords } = makeRecordsForSimulator(text)

    const { readTraces, writeTraces } = makeTraces(formData, readRecords, writeRecords)
    makeGraphs(readTraces, writeTraces)

    const rcuPricing: number = parseFloat(formData.get('rcu_pricing'))
    const wcuPricing: number = parseFloat(formData.get('wcu_pricing'))
    const rcuCost = calculateCost(readTraces.provisionedCapacityTrace, rcuPricing)
    const wcuCost = calculateCost(writeTraces.provisionedCapacityTrace, wcuPricing)
    document.querySelector('#readsPrice').innerHTML = rcuCost
    document.querySelector('#writesPrice').innerHTML = wcuCost

    document.querySelector('#readsGraph')?.scrollIntoView()
}

function makeRecordsForSimulator(text: any) {
    const data = csvToArray(text as string, ",", 5)

    const records = arrayToMetricsRecords(data)
    const readRecords = records.map(r => { return { timestamp: r.timestamp, consumed: r.consumedRead, throttled: r.throttledReads } })
    const writeRecords = records.map(r => { return { timestamp: r.timestamp, consumed: r.consumedWrite, throttled: r.throttledWrites } })
    return { readRecords, writeRecords }
}

function makeTraces(formData: FormData, readRecords: SimTimestepInput[], writeRecords: SimTimestepInput[]) {
    const readTraces = getTraces({
        min: parseInt(formData.get('rcu_min') as any, 10),
        max: parseInt(formData.get('rcu_max') as any, 10),
        target: parseFloat(formData.get('rcu_target') as any),
        scaling_delay_in_seconds: parseInt(formData.get('delay') as any, 10)
    }, readRecords)

    const writeTraces = getTraces({
        min: parseInt(formData.get('wcu_min') as any, 10),
        max: parseInt(formData.get('wcu_max') as any, 10),
        target: parseFloat(formData.get('wcu_target') as any),
        scaling_delay_in_seconds: parseInt(formData.get('delay') as any, 10)
    }, writeRecords)
    return { readTraces, writeTraces }
}

function makeGraphs(readTraces: { provisionedCapacityTrace: { x: string[]; y: number[]; type: string; name: string }; consumedCapacityTrace: { x: string[]; y: number[]; type: string; name: string }; throttledCapacityTrace: { x: string[]; y: number[]; type: string; name: string }; burstAvailableTrace: { x: string[]; y: number[]; type: string; name: string } }, writeTraces: { provisionedCapacityTrace: { x: string[]; y: number[]; type: string; name: string }; consumedCapacityTrace: { x: string[]; y: number[]; type: string; name: string }; throttledCapacityTrace: { x: string[]; y: number[]; type: string; name: string }; burstAvailableTrace: { x: string[]; y: number[]; type: string; name: string } }) {
    const layout = {
        height: 600,
    }
    const config = {
        responsive: true
    }
    readTraces.burstAvailableTrace.visible = 'legendonly'
    writeTraces.burstAvailableTrace.visible = 'legendonly'
    newPlot(
        'readsGraph',
        [
            readTraces.provisionedCapacityTrace,
            readTraces.consumedCapacityTrace,
            readTraces.throttledCapacityTrace,
            readTraces.burstAvailableTrace,
        ],
        { ...layout, title: 'Simulated Reads' },
        config
    )
    newPlot(
        'writesGraph',
        [
            writeTraces.provisionedCapacityTrace,
            writeTraces.consumedCapacityTrace,
            writeTraces.throttledCapacityTrace,
            writeTraces.burstAvailableTrace,
        ],
        { ...layout, title: 'Simulated Writes' },
        config
    )
}

function onTableFormSubmit(e) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    getCloudwatchMetrics(formData.get('region'), formData.get('tableName'))
}

async function onCsvFormSubmit(e) {
    e.preventDefault()
    const file = e.currentTarget.querySelector('input[type="file"').files[0]
    const formData = new FormData(e.currentTarget)
    const reader = new FileReader()
    reader.onload = onCsvFileReady.bind(this, formData)
    reader.readAsText(file)
}

function onDomContentLoaded(e) {
    document.querySelector('#tableForm form')?.addEventListener('submit', onTableFormSubmit)
    document.querySelector('#csvForm form')?.addEventListener('submit', onCsvFormSubmit)
}

document.addEventListener('DOMContentLoaded', onDomContentLoaded, false)

function csvToArray(str: string, delimiter = ",", skipLines = 0) {
    //skip lines
    const lines: string[] = str.split("\n")
    const rows = lines.slice(skipLines)

    const arr = rows.map(row => row.split(delimiter))
    return arr;
}

function arrayToMetricsRecords(arr: string[][]): { timestamp: Date; provisionedRead: number; consumedRead: number; provisionedWrite: number; consumedWrite: number; throttledReads: number; throttledWrites: number }[] {
    // cols are: datetime, provisioned read avg, consumed read, provisioned write avg, consumed write, read throttles, write throttles
    return arr.map((r: string[]) => {
        const timestamp = r[0].replace(/\//g, "-",).replace(" ", "T").replace(/00$/, "00.000Z")
        return {
            timestamp: new Date(Date.parse(timestamp)),
            provisionedRead: Math.round(r[1]),
            consumedRead: Math.round(r[2]),
            provisionedWrite: Math.round(r[3]),
            consumedWrite: Math.round(r[4]),
            throttledReads: Math.round(r[5]),
            throttledWrites: Math.round(r[6])
        }
    })
}

function groupBy<T>(arr: T[], fn: (item: T) => any) {
    return arr.reduce<Record<string, T[]>>((prev, curr) => {
        const groupKey = fn(curr);
        const group = prev[groupKey] || [];
        group.push(curr);
        return { ...prev, [groupKey]: group };
    }, {});
}

function calculateCost(trace: Trace, pricePerHour: number): number {
    // DynamoDB actually bills by sampling a random minute in the hour and bills for the hour based on the provisioned capacity at that time
    // For the purposes of estimating cost here, we will be conservative and use the max provisioned value for the hour to determine the cost.

    const xys = trace.x.map((x, i) => [x, trace.y[i]])
    const byHour = groupBy(xys, (([x,y]) => dayjs(x).hour()))
    const justTheYsCollectedIntoArrays = Object.values(byHour).map(xys => xys.map(xy => xy[1]))
    const hourMaxes = justTheYsCollectedIntoArrays.map((ys) => Math.max(...ys))
    return hourMaxes.reduce((sum, consumed) => { return sum + consumed * pricePerHour })

    // For archival purposes...
    // This will return the sum of the hourly rate billed one minute at a time:
    // return trace.y.reduce((sum, consumedThisMinute) => {
    //     return sum + consumedThisMinute * (pricePerHour / 60.0)
    // }, 0)
}

