import { makeRecordsForSimulator } from "../csv-ingestion";
import { getTraces } from "../plotting";
import { ReadOrWrite, TableMode, StorageClass, getCostPerUnit, optimize } from "../pricing";
import { fetchTableMetrics, getAllTableDetails } from "../table-consumption-fetcher";

const args = process.argv.slice(2)
if (args.length !== 4) {
    console.log('Must pass: profile region start end')
    process.exit(1)
}
const [profile, region, startTimeStr, endTimeStr] = args
const startTime = new Date(Date.parse(startTimeStr))
const endTime = new Date(Date.parse(endTimeStr))

async function main(){
    const allTableDetails = await getAllTableDetails({region, profile})

    for (let tableDetails of allTableDetails) {
        const tableName = tableDetails.name
        const stats = await fetchTableMetrics({region, profile, tableName, startTime, endTime})

        const readUnitCost = await getCostPerUnit(region, ReadOrWrite.Read, tableDetails.mode, tableDetails.storageClass)
        const writeUnitCost = await getCostPerUnit(region, ReadOrWrite.Read, tableDetails.mode, tableDetails.storageClass)

        const { readRecords, writeRecords } = makeRecordsForSimulator(stats)
        // TODO: refactor --Only the scaling delay matters below (other values are overwritten in the optimizer.) 
        const config = {min: 0, max: 0, target: 0.5, scaling_delay_in_seconds: 2*60}

        // --- waiting to use this until we get the scaling config for the table (if its already in pro cap mode)
        // Get traces
        // const scaling_delay_in_seconds = 120
        // const readsConfig = { min: tableDetails. , max: target:, scaling_delay_in_seconds }
        // ----------

        // If table is in OnDemand, try to project its avg daily cost
        let onDemandReadCost = -1 // TODO should these be 0?
        let onDemandWriteCost = -1
        if (tableDetails.mode == TableMode.OnDemand) {
            onDemandReadCost = readRecords.reduce(((sum, r) => sum + r.consumed * readUnitCost), 0)
            onDemandWriteCost = writeRecords.reduce(((sum, r) => sum + r.consumed * readUnitCost), 0)
        }

        const writeLine = (mode: string, o: any, onDemandCost: number) => console.log([region, tableName, mode, o.bestMin, o.bestMax, o.bestTarget, o.bestPrice, onDemandCost].join(','))

        let o
        o = optimize(config, readRecords, readUnitCost)
        writeLine('read', o, onDemandReadCost)

        o = optimize(config, writeRecords, writeUnitCost)
        writeLine('write', o, onDemandWriteCost)
    }
}

main()