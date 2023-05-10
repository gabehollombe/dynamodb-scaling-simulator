import { makeRecordsForSimulator } from "../csv-ingestion";
import { getTraces } from "../plotting";
import { ReadOrWrite, TableMode, StorageClass, getCostPerUnit, optimize, calculateOnDemandCostFromCloudwatchMetrics, calculateProvisionedCostFromCloudWatchMetrics, calculateCost } from "../pricing";
import { fetchTableMetrics, getAllTableDetails, TableDetails } from "../table-consumption-fetcher";
import { readFileSync } from 'fs'
import { TableCapacityConfig } from "../ddb-sim";

const args = process.argv.slice(2)
console.log(args)
if (args.length < 3) {
    console.log('Must pass: region table-stats-dir optimized-report.json')
    process.exit(1)
}
const [region, tableStatsDirPath, optimizedReportPath] = args
const optimizedReport: any = JSON.parse(readFileSync(optimizedReportPath, 'utf8'))

async function main(){
    console.log("region,tableName,tableMode,readOrWrite,bestMin,bestMax,bestTarget,bestPrice,currentAvgDailyCost")

    for (let row of optimizedReport) {
        const filename = [region, 'pd-production', row.tableName].join('_') + '.json'
        let stats: any[] = JSON.parse(readFileSync(`${tableStatsDirPath}/${filename}`, 'utf-8'))
        stats.forEach(s => s.timestamp = typeof s.timestamp == "string" ? new Date(Date.parse(s.timestamp)) : s.timestamp )

        const readUnitCostProvisioned = await getCostPerUnit(region, ReadOrWrite.Read, TableMode.ProvisionedCapacity, StorageClass.Standard)
        const writeUnitCostProvisioned = await getCostPerUnit(region, ReadOrWrite.Write, TableMode.ProvisionedCapacity, StorageClass.Standard)

        const { readRecords, writeRecords } = makeRecordsForSimulator(stats)

        const config: TableCapacityConfig = {min: parseInt(row.bestMin, 10), max: parseInt(row.bestMax, 10), scaling_delay_in_seconds: 120, target: parseInt(row.bestTarget, 10) / 100}

        const readTraces = getTraces(config, readRecords)
        const writeTraces = getTraces(config, writeRecords)

        let trace
        if (row.readOrWrite == ReadOrWrite.Read) {
            trace = readTraces.provisionedCapacityTrace
            console.log([row.region, row.tableName, row.tableMode, row.readOrWrite, row.bestMin, row.bestMax, row.bestTarget, calculateCost(trace, readUnitCostProvisioned), row.currentAvgDailyCost].join(","))
        } else {
            trace = writeTraces.provisionedCapacityTrace
            console.log([row.region, row.tableName, row.tableMode, row.readOrWrite, row.bestMin, row.bestMax, row.bestTarget, calculateCost(trace, writeUnitCostProvisioned), row.currentAvgDailyCost].join(","))
        }

    }


    // process.exit(0)
}

main()