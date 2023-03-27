import { SimTimestepInput, Trace, getTraces } from './plotting'
import dayjs from 'dayjs'
import * as optimjs from 'optimization-js'
import { TableCapacityConfig } from './ddb-sim';

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

export function calculateCost(trace: Trace, pricePerHour: number): number {
    // DynamoDB actually bills by sampling a random minute in the hour and bills for the hour based on the provisioned capacity at that time
    // For the purposes of estimating cost here, we will be conservative and use the max provisioned value for the hour to determine the cost.

    const xys = trace.x.map((x, i) => [x, trace.y[i]])
    const byHour = groupBy(xys, (([x,y]) => `${dayjs(x).year()}|${dayjs(x).month()}|${dayjs(x).date()}|${dayjs(x).hour()}`))
    const justTheYsCollectedIntoArrays = Object.values(byHour).map(xys => xys.map(xy => parseFloat(xy[1] as string)))
    const hourMaxes = justTheYsCollectedIntoArrays.map((ys) => Math.max(...ys))
    const someOfHourlyCosts = hourMaxes.reduce((sum, consumed) => { return sum + consumed * pricePerHour })

    return (someOfHourlyCosts / hourMaxes.length) * 24 // avg hourly cost * 24 for daily avg cost

    // For archival purposes...
    // This will return the sum of the hourly rate billed one minute at a time:
    // return trace.y.reduce((sum, consumedThisMinute) => {
    //     return sum + consumedThisMinute * (pricePerHour / 60.0)
    // }, 0)
}

function makeObjectiveFn(scalingConfig: TableCapacityConfig, records: SimTimestepInput[], pricePerHour: number) {
    return function(vals: any[]){
      // make new config with adjusted target based on injected value from solver...
      // vals comes in with a target util param as an integer, so make it a float...
      let [ target  ] = vals
      target = target / 100.0

      const adjustedConfig = {...scalingConfig, target}

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
    const costDims = [ optimjs.Integer(30, 90) ] // this is the range of values to test for targetUtil on the table
    const optimizationSteps = 100
    const dummy_result = optimjs.dummy_minimize(costObjFn, costDims, optimizationSteps)
    const bestTarget = dummy_result.best_x
    const bestPrice = dummy_result.best_y
    return { bestTarget, bestPrice }
}