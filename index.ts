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

function addResultRows({tableId, description, min, max, target, cost}) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    const template = document.querySelector('#resultRow');

    if ('content' in document.createElement('template')) {
        const clone = template.content.cloneNode(true);
        let td = clone.querySelectorAll("td");
        td[0].textContent = description
        td[1].textContent = min
        td[2].textContent = max
        td[3].textContent = target
        td[4].textContent = `$ ${Math.round(cost * 100)/100} USD `// round to 2 deicimal places
    
        tbody.prepend(clone);
    
    } else {
        tbody.innerHTML = `<tr><td colspan="5">${description} | ${min} | ${max} | ${target} | ${cost}</td></tr>`
    }
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

    if (window.Worker) {
        const worker = new Worker(new URL("./optimization-worker.ts", import.meta.url), { type: 'module' })

        const { readsConfig, writesConfig } = getScalingConfigsFromFormData(formData)
        worker.postMessage({ taskId: 'readOptimize', scalingConfig: readsConfig, records: readRecords, pricePerHour: rcuPricing })
        worker.postMessage({ taskId: 'writeOptimize', scalingConfig: writesConfig, records: writeRecords, pricePerHour: wcuPricing })

        addResultRows({
            tableId: 'readsResults', 
            description: 'Your manual config (entered above)', 
            min: readsConfig.min,
            max: readsConfig.max,
            target: readsConfig.target,
            cost: rcuCost
        })

        addResultRows({
            tableId: 'writesResults', 
            description: 'Your manual config (entered above)', 
            min: writesConfig.min,
            max: writesConfig.max,
            target: writesConfig.target,
            cost: wcuCost
        })


        worker.onmessage = (e) => {
            const { taskId, bestMin, bestMax, bestPrice, bestTarget } = e.data
            if (taskId == 'readOptimize') {
                document.querySelector('table#readsResults tbody tr.pleaseWait')?.setAttribute('hidden', 'true')

                addResultRows({
                    tableId: 'readsResults', 
                    description: 'Optimized config (from my auto tuning)', 
                    min: bestMin,
                    max: bestMax,
                    target: bestTarget,
                    cost: bestPrice
                })

            }
            if (taskId == 'writeOptimize') {
                document.querySelector('table#writesResults tbody tr.pleaseWait')?.setAttribute('hidden', 'true')

                addResultRows({
                    tableId: 'writesResults', 
                    description: 'Optimized config (from my auto tuning)', 
                    min: bestMin,
                    max: bestMax,
                    target: bestTarget,
                    cost: bestPrice
                })
            }
        }

    }
    else {
        document.querySelector('#readsResults tbody tr.pleaseWait td').innerHTML = `Error: no Web Worker support. Skipping optimization.`
        document.querySelector('#writesResults tbody tr.pleaseWait td').innerHTML = `Error: no Web Worker support. Skipping optimization.`
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
