import { getCloudWatchUrl } from './cloudwatch-opener'
import { getTraces, SimTimestepInput } from './plotting'
import { newPlot } from 'plotly.js-dist'

function getCloudwatchMetrics(region: string, tableName: string) {
    const url = getCloudWatchUrl(region, tableName)
    window.open(url)
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
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target!.result;
        const data = csvToArray(text as string, ",", 5);

        const records = arrayToMetricsRecords(data)
        const readRecords = records.map(r => {return {timestamp: r.timestamp, consumed: r.consumedRead, throttled: r.throttledReads}})
        const writeRecords = records.map(r => {return {timestamp: r.timestamp, consumed: r.consumedWrite, throttled: r.throttledWrites}})

        const readTraces = getTraces({
            min: parseInt(formData.get('min') as any, 10),
            max: parseInt(formData.get('max') as any, 10),
            target: parseFloat(formData.get('target') as any),
            scaling_delay_in_seconds: parseInt(formData.get('delay') as any, 10)
        }, readRecords)

        const writeTraces = getTraces({
            min: parseInt(formData.get('min') as any, 10),
            max: parseInt(formData.get('max') as any, 10),
            target: parseFloat(formData.get('target') as any),
            scaling_delay_in_seconds: parseInt(formData.get('delay') as any, 10)
        }, writeRecords)

        const layout = {
            height: 1000,
        };
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
            {...layout, title: 'Simulated Reads'},
            config,
        )
        newPlot(
            'writesGraph', 
            [
                writeTraces.provisionedCapacityTrace,
                writeTraces.consumedCapacityTrace,
                writeTraces.throttledCapacityTrace,
                writeTraces.burstAvailableTrace,
            ],
            {...layout, title: 'Simulated Writes'},
            config,
        )
    };
    reader.readAsText(file);
}

function onDomContentLoaded(e) {
    document.querySelector('#tableForm form')?.addEventListener('submit', onTableFormSubmit)
    document.querySelector('#csvForm form')?.addEventListener('submit', onCsvFormSubmit)
}

document.addEventListener('DOMContentLoaded', onDomContentLoaded, false)

function csvToArray(str: string, delimiter = ",", skipLines=0) {
    //skip lines
    const lines: string[] = str.split("\n")
    const rows = lines.slice(skipLines)

    const arr = rows.map(row => row.split(delimiter))
    return arr;
}

function arrayToMetricsRecords(arr: string[][]): { timestamp: Date; provisionedRead: number; consumedRead: number; provisionedWrite: number; consumedWrite: number; throttledReads: number; throttledWrites: number }[] {
    // cols are: datetime, provisioned read avg, consumed read, provisioned write avg, consumed write, read throttles, write throttles
    return arr.map((r: string[])=>{
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
