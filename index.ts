import { getCloudWatchUrl } from './cloudwatch-opener'
import { getTraces, Record } from './plotting'
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
        const traces = getTraces({
            min: parseInt(formData.get('min') as any, 10),
            max: parseInt(formData.get('max') as any, 10),
            target: parseFloat(formData.get('target') as any),
            scaling_delay_in_seconds: parseInt(formData.get('delay') as any, 10)
        }, records)

        const layout = {
            title:'Simulated Scaling',
            height: 1000,
        };
        const config = {
            responsive: true
        }
        traces.burstAvailableTrace.visible = 'legendonly'
        newPlot(
            'graph', 
            [
                traces.provisionedCapacityTrace,
                traces.consumedCapacityTrace,
                traces.throttledCapacityTrace,
                traces.burstAvailableTrace,
            ],
            layout,
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

function arrayToMetricsRecords(arr: string[][]): Record[] {
    // cols are: datetime, provisioned read avg, consumed read, provisioned write avg, consumed write, read throttles, write throttles
    return arr.map((r: string[])=>{
        const timestamp = r[0].replace(/\//g, "-",).replace(" ", "T").replace(/00$/, "00.000Z")
        return {
            timestamp: new Date(Date.parse(timestamp)),
            consumedRead: Math.round(r[2]),
            consumedWrite: Math.round(r[4]),
            throttledReads: Math.round(r[5]),
            throttledWrites: Math.round(r[6])
        }
    })
}
