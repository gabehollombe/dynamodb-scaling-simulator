import {spawn} from 'child_process'

export function getCloudWatchUrl(region: string, table_name: string): string {
    return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#metricsV2:graph=~(metrics~(~(~'AWS*2fDynamoDB~'ProvisionedReadCapacityUnits~'TableName~'${table_name}~(stat~'Average~label~'ProvisionedRCUAvg))~(~'.~'ConsumedReadCapacityUnits~'.~'.~(stat~'Sum~label~'ConsumedRCUSum))~(~'.~'ProvisionedWriteCapacityUnits~'.~'.~(stat~'Average~label~'ProvisionedWCUAvg))~(~'.~'ConsumedWriteCapacityUnits~'.~'.~(stat~'Sum~label~'ConsumedWCUSum))~(~'.~'ReadThrottleEvents~'.~'.~(label~'ReadThrottlesSum~stat~'Sum))~(~'.~'WriteThrottleEvents~'.~'.~(label~'WriteThrottlesSum~stat~'Sum)))~title~'Provisioned*2c*20Consumed*2c*20Throttled~view~'timeSeries~stacked~false~region~'${region}~period~60~yAxis~(left~(showUnits~false)))`
}

export async function openCloudwatchGraph(region: string, table_name: string): Promise<void> {
    let url = getCloudWatchUrl(region, table_name)
    let start = (process.platform == 'darwin'? 'open': process.platform == 'win32'? 'start': 'xdg-open');
    spawn(start, [url])
}

// // Usage:  openCloudwatchGraph(region, tableName)
// if (!process.env.REGION && process.env.TABLE_NAME) {
//     console.log('REGION and TABLE_NAME must be passed to this script as env vars')
// }
// else {
//     openCloudwatchGraph(process.env.REGION as string, process.env.TABLE_NAME as string)
//     console.log('Opened CloudWatch graph in a browser window.')
//     console.log(`Select "Actions -> Download as .csv" and save to "data.csv" in this same directory: ${__dirname}`)
//     console.log(`Then edit example_main_csv.ts in this directory to config scaling values.`)
//     console.log(`Then run "npx ts-node example_main_csv.ts to get your graph.`)
// }