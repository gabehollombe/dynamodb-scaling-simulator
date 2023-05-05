import { makeRecordsForSimulator } from "../csv-ingestion";
import { getTraces } from "../plotting";
import { ReadOrWrite, TableMode, StorageClass, getCostPerUnit, optimize, calculateOnDemandCostFromCloudwatchMetrics, calculateProvisionedCostFromCloudWatchMetrics } from "../pricing";
import { fetchTableMetrics, getAllTableDetails, TableDetails } from "../table-consumption-fetcher";
import { readFileSync, writeFileSync } from 'fs'
import { bool } from "aws-sdk/clients/signer";

const args = process.argv.slice(2)
console.log(args)
if (args.length < 7) {
    console.log('Must pass: region profile roleArn start end table-details-dump.json destination-dir [startWithTableName]')
    process.exit(1)
}
const [region, profile, roleArn, startTimeStr, endTimeStr, tableDetailsDumpPath, destinationDir, startWithTableName] = args
const startTime = new Date(Date.parse(startTimeStr))
const endTime = new Date(Date.parse(endTimeStr))
const allTableDetails: TableDetails[] = JSON.parse(readFileSync(tableDetailsDumpPath, 'utf8'))

async function main(){
    console.log("region,tableName,tableMode,readOrWrite,bestMin,bestMax,bestTarget,bestPrice,currentAvgDailyCost")

    var stopSkipping: bool
    stopSkipping = true
    if (startWithTableName !== undefined) {
        stopSkipping = false
    }

    // For now, only process the on-demand tables
    for (let tableDetails of allTableDetails.filter(t => t.mode == TableMode.OnDemand)) {
        const tableName = tableDetails.name
        if (stopSkipping == false && tableName != startWithTableName) {
            process.stderr.write(`Skipping table: ${tableDetails.name}\n`)
            continue
        }
        stopSkipping = true
        process.stderr.write(`Processing table: ${tableDetails.name}\n`)

        const stats = await fetchTableMetrics({region, profile, roleArn, tableName, startTime, endTime})
        const filename = [region, profile, tableName].join('_') + '.json'
        writeFileSync(`${destinationDir}/${filename}`, JSON.stringify(stats))
        process.stderr.write(`Done with table: ${tableDetails.name}\n`)
    }
    process.exit(0)
}

main()