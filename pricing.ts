import { SimTimestepInput, Trace, getTraces } from './plotting'
import dayjs from 'dayjs'
import * as optimjs from 'optimization-js'
import { TableCapacityConfig } from './ddb-sim';
import { Readable } from 'stream';
import { parse } from 'csv-parse';

export enum ReadOrWrite {
    Read = 'Read',
    Write = 'Write'
}

export enum TableMode {
    OnDemand = 'OnDemand',
    ProvisionedCapacity = 'ProvisionedCapacity'
}

export enum TermType {
    Reserved = 'Reserved',
    OnDemand = 'OnDemand'
}

export enum StorageClass {
    Standard = 'Standard',
    InfrequentAccess = 'InfrequentAccess'
}

export type PriceRecord = {
    termType: TermType,
    contractLength: string
    unit: string
    pricePerUnit: number
    currency: string
    region: string
    mode: TableMode
    storageClass: StorageClass
    description: string
    row?: any
}


function sum(arr: number[]) {
    return arr.reduce((sum, n) => { return sum + n }, 0)
}

function groupBy<T>(arr: T[], fn: (item: T) => any) {
    return arr.reduce<Record<string, T[]>>((prev, curr) => {
        const groupKey = fn(curr);
        const group = prev[groupKey] || [];
        group.push(curr);
        return { ...prev, [groupKey]: group };
    }, {});
}

function hourKey(timestamp: number | Date): string {
    const d = dayjs(timestamp)
    return `${d.year()}|${d.month()}|${d.date()}|${d.hour()}`
}

export function calculateCost(trace: Trace, pricePerHour: number): number {
    // DynamoDB actually bills by sampling a random minute in the hour and bills for the hour based on the provisioned capacity at that time
    // For the purposes of estimating cost here, we will be conservative and use the max provisioned value for the hour to determine the cost.

    const xys = trace.x.map((x, i) => [x, trace.y[i]])
    const byHour = groupBy(xys, (([x,y]) => `${dayjs(x).year()}|${dayjs(x).month()}|${dayjs(x).date()}|${dayjs(x).hour()}`))
    const justTheYsCollectedIntoArrays = Object.values(byHour).map(xys => xys.map(xy => parseFloat(xy[1] as string)))
    const hourMaxes = justTheYsCollectedIntoArrays.map((ys) => Math.max(...ys))
    return sum(hourMaxes) * pricePerHour / hourMaxes.length * 24
}

export function calculateProvisionedCostFromCloudWatchMetrics(records: SimTimestepInput[], pricePerHour: number): number {
    // DynamoDB actually bills by sampling a random minute in the hour and bills for the hour based on the provisioned capacity at that time
    // For the purposes of estimating cost here, we will be conservative and use the max provisioned value for the hour to determine the cost.

    const byHour = groupBy(records, (r => hourKey(r.timestamp)))
    const consumptionSumsInArrays = Object.values(byHour).map(recs => recs.map(r => r.consumed + r.throttled))
    const hourMaxes = consumptionSumsInArrays.map((consumeds) => Math.max(...consumeds))
    return sum(hourMaxes) * pricePerHour / hourMaxes.length * 24
}

export function calculateOnDemandCostFromCloudwatchMetrics(records: SimTimestepInput[], pricePerUnit: number) {
    // On-demand doesn't bill for throttles, so just sum consumed * pricePerUnit
    const byHour = groupBy(records, (r => hourKey(r.timestamp)))
    const consumptionsInArrays = Object.values(byHour).map(recs => recs.map(r => r.consumed))
    const hourSums = consumptionsInArrays.map((consumeds) => sum(consumeds))
    return sum(hourSums) * pricePerUnit / hourSums.length * 24
}

function makeObjectiveFn(scalingConfig: TableCapacityConfig, records: SimTimestepInput[], pricePerHour: number) {
    return function(vals: any[]){
      // make new config with adjusted target based on injected value from solver...
      // vals comes in with a target util param as an integer, so make it a float...
      let [ 
            min,
            max,
            target,
        ] = vals
      target = target / 100.0

      const adjustedConfig = {...scalingConfig, min, max, target}

      // run the sim with our data
      const traces = getTraces(adjustedConfig, records)

      // if we have any throttles, we want to return a prohibitively high number here because we don't even care about price if we throttle
      const throttleCount = sum(traces.throttledCapacityTrace.y.slice(5)) // ignore first 5 minutes of throttles
      if (throttleCount > 0) {
        return 99999999999
      }
      else {
        const numMinutes = traces.provisionedCapacityTrace.x.length
        const numDays = numMinutes / (60 * 24)
        const avgDailyCost = calculateCost(traces.provisionedCapacityTrace, pricePerHour)
        return avgDailyCost
      }
    }
}

export function optimize(scalingConfig: TableCapacityConfig, records: SimTimestepInput[], pricePerHour: number) {
    const costObjFn = makeObjectiveFn(scalingConfig, records, pricePerHour)

    const summedDemands = records.map((_, i) => { return Math.round((records[i].consumed + records[i].throttled) / 60)})

    // Figure out sane values for min and max capacity config
    const minBottom = 1
    const minTop = Math.max(1, Math.max(...summedDemands))
    const maxBottom = Math.max(minTop, Math.min(1, Math.max(...summedDemands) * 0.5))
    const maxTop = Math.max(1, 3 * Math.max(...summedDemands))


    // TODO: consider droping min/max cap config from the optimization search. We can use our own brains for this value right?

    const costDims = [ 
        optimjs.Integer(minBottom, minTop), // min capacity
        optimjs.Integer(maxBottom, maxTop), // max capacity
        optimjs.Integer(20, 90), // target utilization
    ] 
    const optimizationSteps = 256
    const dummy_result = optimjs.rs_minimize(costObjFn, costDims, optimizationSteps)
    const [bestMin, bestMax, bestTarget] = dummy_result.best_x
    const bestPrice = dummy_result.best_y
    
    return { 
        bestMin,
        bestMax,
        bestTarget, 
        bestPrice 
    }
}



async function getPricesByRegion() {
    const url = `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/index.csv`
    var s = new Readable()
    const csv = await (await fetch(url)).text()
    s.push(csv)    // the string you want
    s.push(null) 

    let records = new Map<string, PriceRecord[]>()

    const parser = s
      .pipe(parse({
       from_line: 7, // first lines are meta data and headers
    }));
    for await (let r of parser) {
        let termType 
        if (!["OnDemand", "Reserved"].includes(r[3])) {
            throw new Error(`Can't parse table mode ${r[3]} for line ${r}`)
        }
        else {
            termType = r[3] == "OnDemand" ? TermType.OnDemand : TermType.Reserved
        }

        let mode
        if (!["Amazon DynamoDB PayPerRequest Throughput", "Provisioned IOPS"].includes(r[14])) {
            continue // we don't care about rows that are not about on-demand or provisioned-capacity table modes for now
        }
        else {
            mode = r[14] == "Provisioned IOPS" ? TableMode.ProvisionedCapacity : TableMode.OnDemand
        }

        const description = r[4]
        const contractLength = r[11] // empty or 1yr or 3yr
        const unit = r[8] // ReadCapacityUnit-Hrs or WriteCapacityUnit-Hrs or ReadRequestUnits or WriteRequestUnits
        const pricePerUnit = parseFloat(r[9])
        const currency = r[10] // USD
        const region = r[23] as string
        const storageClass = r[21].indexOf('IA-') !== -1 ? StorageClass.InfrequentAccess : StorageClass.Standard

        const record = {description, termType, contractLength, unit, pricePerUnit, currency, region, mode, storageClass, row: r}
        let updated = records.get(region) || []
        updated.push(record)
        records.set(region, updated)
    }
    return records
}


export async function getCostPerUnit(region: string, op: ReadOrWrite, mode: TableMode, storageClass: StorageClass ) {
    const prices = (await getPricesByRegion()).get(region)
    if (!prices) {
        throw new Error(`Can't get prices for ${region}`)
    }

    const wantUnitByOpAndMode = {
        [ReadOrWrite.Read]: {
            [TableMode.OnDemand]: 'ReadRequestUnits',
            [TableMode.ProvisionedCapacity]: 'ReadCapacityUnit-Hrs',
        },
        [ReadOrWrite.Write]: {
            [TableMode.OnDemand]: 'WriteRequestUnits',
            [TableMode.ProvisionedCapacity]: 'WriteCapacityUnit-Hrs',
        },
    }
    const priceRecords: PriceRecord[] = prices
        .filter(r => r.mode == mode)
        .filter(r => r.pricePerUnit !== 0)
        .filter(r => r.contractLength == '')
        .filter(r => r.unit == wantUnitByOpAndMode[op][mode])
        .filter(r => r.storageClass == storageClass)

    return priceRecords[0].pricePerUnit
}