import { makeRecordsForSimulator } from "../csv-ingestion";
import { getTraces } from "../plotting";
import { ReadOrWrite, TableMode, StorageClass, getCostPerUnit, optimize, calculateOnDemandCostFromCloudwatchMetrics, calculateProvisionedCostFromCloudWatchMetrics } from "../pricing";
import { fetchTableMetrics, getAllTableDetails, TableDetails } from "../table-consumption-fetcher";
import { readFileSync } from 'fs'

const args = process.argv.slice(2)
console.log(args)
if (args.length < 6) {
    console.log('Must pass: region profile roleArn start end table-details-dump.json [table-stats-dir]')
    process.exit(1)
}
const [region, profile, roleArn, startTimeStr, endTimeStr, tableDetailsDumpPath, tableStatsDirPath, startWithTableName] = args
const startTime = new Date(Date.parse(startTimeStr))
const endTime = new Date(Date.parse(endTimeStr))
const allTableDetails: TableDetails[] = JSON.parse(readFileSync(tableDetailsDumpPath, 'utf8'))

async function main(){
    var stopSkipping: boolean
    stopSkipping = true
    if (startWithTableName !== undefined) {
        stopSkipping = false
    }

    console.log("region,tableName,tableMode,readOrWrite,bestMin,bestMax,bestTarget,bestPrice,currentAvgDailyCost")
    // For now, only process the on-demand tables
    for (let tableDetails of allTableDetails.filter(t => t.mode == TableMode.OnDemand)) {
        if (stopSkipping == false && tableDetails.name != startWithTableName) {
            process.stderr.write(`Skipping table: ${tableDetails.name}\n`)
            continue
        }

        stopSkipping = true

        process.stderr.write(`Processing table: ${tableDetails.name}\n`)
        const tableName = tableDetails.name

        let stats: any[]
        if (tableStatsDirPath == "") {
            process.stderr.write(`Fetching table metrics for: ${tableName}\n`)
            stats = await fetchTableMetrics({region, profile, roleArn, tableName, startTime, endTime})
        }
        else {
            const filename = [region, profile, tableName].join('_') + '.json'
            stats = JSON.parse(readFileSync(`${tableStatsDirPath}/${filename}`, 'utf-8'))
            stats.forEach(s => s.timestamp = typeof s.timestamp == "string" ? new Date(Date.parse(s.timestamp)) : s.timestamp )
        }

        const readUnitCost = await getCostPerUnit(region, ReadOrWrite.Read, tableDetails.mode, tableDetails.storageClass)
        const writeUnitCost = await getCostPerUnit(region, ReadOrWrite.Read, tableDetails.mode, tableDetails.storageClass)

        const readUnitCostProvisioned = await getCostPerUnit(region, ReadOrWrite.Read, TableMode.ProvisionedCapacity, tableDetails.storageClass)
        const writeUnitCostProvisioned = await getCostPerUnit(region, ReadOrWrite.Read, TableMode.ProvisionedCapacity, tableDetails.storageClass)

        const { readRecords, writeRecords } = makeRecordsForSimulator(stats)

        // TODO: refactor --Only the scaling delay matters below (other values are overwritten in the optimizer.) 
        const config = {min: 0, max: 0, target: 0.5, scaling_delay_in_seconds: 2*60}

        // If table is in OnDemand, try to project its avg daily cost
        let readCost: number
        let writeCost: number
        if (tableDetails.mode == TableMode.OnDemand) {
            readCost = calculateOnDemandCostFromCloudwatchMetrics(readRecords, readUnitCost)
            writeCost = calculateOnDemandCostFromCloudwatchMetrics(writeRecords, writeUnitCost)
        } else {
            readCost = calculateProvisionedCostFromCloudWatchMetrics(readRecords, readUnitCost)
            writeCost = calculateProvisionedCostFromCloudWatchMetrics(writeRecords, writeUnitCost)
        }

        const writeLine = (mode: string, readWrite: string, o: any, currentAvgDailyCost: number) => console.log([region, tableName, mode, readWrite, o.bestMin, o.bestMax, o.bestTarget, o.bestPrice, currentAvgDailyCost].join(','))

        let o
        o = optimize(config, readRecords, readUnitCostProvisioned)
        writeLine(tableDetails.mode, 'read', o, readCost)

        o = optimize(config, writeRecords, writeUnitCostProvisioned)
        writeLine(tableDetails.mode, 'write', o, writeCost)
        process.stderr.write(`Done with table: ${tableDetails.name}\n`)
    }
    process.exit(0)
}

main()