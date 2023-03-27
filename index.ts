import { getCloudWatchUrl } from './cloudwatch-opener'
import { getTraces, Trace, SimTimestepInput } from './plotting'
import { newPlot } from 'plotly.js-dist'
import { calculateCost, optimize } from './pricing'
import { arrayToMetricsRecords, makeRecordsForSimulator } from './csv-ingestion'

import dayjs from 'dayjs'

function getCloudwatchMetrics(region: string, tableName: string) {
    const url = getCloudWatchUrl(region, tableName)
    window.open(url)
}

function getScalingConfigsFromFormData(formData: FormData) {
    const readsConfig = {
        min: parseInt(formData.get('rcu_min') as any, 10),
        max: parseInt(formData.get('rcu_max') as any, 10),
        target: parseFloat(formData.get('rcu_target') as any),
        scaling_delay_in_seconds: parseInt(formData.get('delay') as any, 10)
    }
    const writesConfig = {
        min: parseInt(formData.get('wcu_min') as any, 10),
        max: parseInt(formData.get('wcu_max') as any, 10),
        target: parseFloat(formData.get('wcu_target') as any),
        scaling_delay_in_seconds: parseInt(formData.get('delay') as any, 10)
    }

    return { readsConfig, writesConfig }
}

function getTracesFromFormData(formData: FormData, readRecords: SimTimestepInput[], writeRecords: SimTimestepInput[]) {
    const { readsConfig, writesConfig } = getScalingConfigsFromFormData(formData)
    const readTraces = getTraces(readsConfig, readRecords)
    const writeTraces = getTraces(writesConfig, writeRecords)
    return { readTraces, writeTraces }
}

function onCsvFileReady(formData: FormData, e) {
    const text = e.target!.result;
    const data = csvToArray(text as string, ",", 5)
    const metricsRecords = arrayToMetricsRecords(data)
    const { readRecords, writeRecords } = makeRecordsForSimulator(metricsRecords)

    const { readTraces, writeTraces } = getTracesFromFormData(formData, readRecords, writeRecords)
    makeGraphs(readTraces, writeTraces)
    document.querySelector('#results')?.setAttribute('style', 'display: block')
    document.querySelector('#readsGraph')?.scrollIntoView()

    const rcuPricing: number = parseFloat(formData.get('rcu_pricing'))
    const wcuPricing: number = parseFloat(formData.get('wcu_pricing'))
    const rcuCost = calculateCost(readTraces.provisionedCapacityTrace, rcuPricing)
    const wcuCost = calculateCost(writeTraces.provisionedCapacityTrace, wcuPricing)
    document.querySelector('#readsPrice').innerHTML = rcuCost
    document.querySelector('#writesPrice').innerHTML = wcuCost


    if (window.Worker) {
        const worker = new Worker(new URL("./optimization-worker.ts", import.meta.url), { type: 'module' })

        document.querySelector('#readsOptimized').innerHTML = `Calculating optimized config for reads...`
        document.querySelector('#writesOptimized').innerHTML = `Calculating optimized config for writes...`

        const { readsConfig, writesConfig } = getScalingConfigsFromFormData(formData)
        worker.postMessage({ taskId: 'readOptimize', scalingConfig: readsConfig, records: readRecords, pricePerHour: rcuPricing })
        worker.postMessage({ taskId: 'writeOptimize', scalingConfig: writesConfig, records: writeRecords, pricePerHour: wcuPricing })

        worker.onmessage = (e) => {
            const { taskId, bestPrice, bestTarget } = e.data
            if (taskId == 'readOptimize') {
                document.querySelector('#readsOptimized').innerHTML = `Optimized RCU config target util is ${bestTarget}% yielding avg daily price of ${bestPrice}`
            }
            if (taskId == 'writeOptimize') {
                document.querySelector('#writesOptimized').innerHTML = `Optimized WCU config target util is ${bestTarget}% yielding avg daily price of ${bestPrice}`
            }
        }

    }
    else {
        document.querySelector('#readsOptimized').innerHTML = `Error: no Web Worker support. Skipping optimization.`
        document.querySelector('#writesOptimized').innerHTML = `Error: no Web Worker support. Skipping optimization.`
    }
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
