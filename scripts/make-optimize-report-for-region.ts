import { makeRecordsForSimulator } from "../csv-ingestion";
import { getTraces } from "../plotting";
import { ReadOrWrite, TableMode, StorageClass, getCostPerUnit, optimize, calculateOnDemandCostFromCloudwatchMetrics, calculateProvisionedCostFromCloudWatchMetrics } from "../pricing";
import { fetchTableMetrics, getAllTableDetails, TableDetails } from "../table-consumption-fetcher";
import { readFileSync } from 'fs'

const args = process.argv.slice(2)
if (args.length !== 5) {
    console.log('Must pass: profile region start end table-details-dump.json')
    process.exit(1)
}
const [profile, region, startTimeStr, endTimeStr, tableDetailsDumpPath] = args
const startTime = new Date(Date.parse(startTimeStr))
const endTime = new Date(Date.parse(endTimeStr))
const allTableDetails: TableDetails[] = JSON.parse(readFileSync(tableDetailsDumpPath, 'utf8'))

async function main(){
    console.log("region,tableName,tableMode,readOrWrite,bestMin,bestMax,bestTarget,bestPrice,currentAvgDailyCost")
    // For now, only process the on-demand tables
    for (let tableDetails of allTableDetails.filter(t => t.mode == TableMode.OnDemand)) {
        process.stderr.write(`Processing table: ${tableDetails.name}\n`)
        const tableName = tableDetails.name
        const stats = await fetchTableMetrics({region, profile, tableName, startTime, endTime})

        const readUnitCost = await getCostPerUnit(region, ReadOrWrite.Read, tableDetails.mode, tableDetails.storageClass)
        const writeUnitCost = await getCostPerUnit(region, ReadOrWrite.Read, tableDetails.mode, tableDetails.storageClass)

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
        o = optimize(config, readRecords, readUnitCost)
        writeLine(tableDetails.mode, 'read', o, readCost)

        o = optimize(config, writeRecords, writeUnitCost)
        writeLine(tableDetails.mode, 'write', o, writeCost)
        process.stderr.write(`Done with table: ${tableDetails.name}\n`)
    }
    process.exit(0)
}

main()