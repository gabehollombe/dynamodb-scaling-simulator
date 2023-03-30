import { fromIni } from "@aws-sdk/credential-providers";
import { CloudWatchClient, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { DynamoDBClient, ListTablesCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { ApplicationAutoScalingClient, DescribeScalableTargetsCommand, DescribeScalingPoliciesCommand } from "@aws-sdk/client-application-auto-scaling";
import { TableMode, StorageClass } from "./pricing";

type FetchTableMetricsParams = {
    profile: string
    region: string
    tableName: string
    startTime: Date
    endTime: Date
}

export type TableDetails = {
    region: string
    name: string
    mode: TableMode
    storageClass: StorageClass
    provisionedRCUs: number
    provisionedWCUs: number
}

async function getTableDetails(ddbClient: DynamoDBClient, scalingClient: ApplicationAutoScalingClient , name: string): Promise<TableDetails> {
    const detailsResponse = await ddbClient.send(new DescribeTableCommand({ TableName: name }))

    // console.log(detailsResponse)
    
    // // Get scaling info for the table, if it exists
    // const scalingResponse = await scalingClient.send(new DescribeScalingPoliciesCommand({ServiceNamespace: 'dynamodb', ResourceId: `table/${name}`}))
    // let scalingConfigs
    // if (scalingResponse.ScalingPolicies && scalingResponse.ScalingPolicies.length > 0) {
    //     //TODO try to find the read and write policies 
    // }

    let mode
    if (detailsResponse.Table?.BillingModeSummary === undefined) {
        // BillingModeSummary is empty if the table is really old, so it must be ProvisionedCapacity
        mode = TableMode.ProvisionedCapacity
    } else if (!['PROVISIONED', 'PAY_PER_REQUEST'].includes(detailsResponse.Table?.BillingModeSummary?.BillingMode as string)) {
        throw new Error(`Can't parse table ${name} billing mode: ${detailsResponse.Table?.BillingModeSummary?.BillingMode}`)
    }
    mode = detailsResponse.Table?.BillingModeSummary?.BillingMode == 'PROVISIONED' ? TableMode.ProvisionedCapacity : TableMode.OnDemand

    let storageClass
    if (detailsResponse.Table?.TableClassSummary == undefined) {
        // TableClassSummary is empty if the table is really old, so it must be Standard
        storageClass = StorageClass.Standard
    }
    else if (!['STANDARD', 'STANDARD_INFREQUENT_ACCESS'].includes(detailsResponse.Table?.TableClassSummary?.TableClass as string)) {
        throw new Error(`Can't parse table ${name} table class: ${detailsResponse.Table?.TableClassSummary?.TableClass}`)
    }
    storageClass = detailsResponse.Table?.TableClassSummary?.TableClass == 'STANDARD' ? StorageClass.Standard : StorageClass.InfrequentAccess

    const provisionedRCUs = detailsResponse.Table?.ProvisionedThroughput?.ReadCapacityUnits as number
    const provisionedWCUs = detailsResponse.Table?.ProvisionedThroughput?.WriteCapacityUnits as number
    const region = ddbClient.config.region as string

    const details = { region, name, mode, storageClass, provisionedRCUs, provisionedWCUs }
    return details
}

export async function getAllTableDetails({ region, profile }: { region: string, profile: string }): Promise<TableDetails[]> {
    const ddbClient = new DynamoDBClient({
        region,
        credentials: fromIni({ profile })
    })
    const scalingClient = new ApplicationAutoScalingClient({
        region,
        credentials: fromIni({ profile })
    })

    let allDetails: Promise<TableDetails>[] = []

    let lastEvaluatedTableName
    const DEBUG_MAX_RECORDS = 3
    let record_count = 0
    do {
        const listResponse = await ddbClient.send(new ListTablesCommand({ ExclusiveStartTableName: lastEvaluatedTableName }))
        lastEvaluatedTableName = listResponse.LastEvaluatedTableName as any
        if (listResponse.TableNames) {
            for (let name of listResponse.TableNames) {
                if (record_count > DEBUG_MAX_RECORDS) { continue }
                allDetails.push(getTableDetails(ddbClient, scalingClient, name))
                record_count += 1
            }
        }
    } while (lastEvaluatedTableName !== undefined)

    return Promise.all(allDetails)
}


export async function fetchTableMetrics(params: FetchTableMetricsParams): Promise<{ timestamp: Date, consumedRead: number, consumedWrite: number, throttledReads: number, throttledWrites: number }[]> {
    const cloudwatch = new CloudWatchClient({
        region: params.region,
        credentials: fromIni({ profile: params.profile })
    })

    const namespace = "AWS/DynamoDB";
    const period = 60; // seconds

    const consumedReads = {
        Id: "consumedRead",
        MetricStat: {
            Metric: {
                Dimensions: [
                    {
                        Name: "TableName",
                        Value: params.tableName
                    }
                ],
                MetricName: "ConsumedReadCapacityUnits",
                Namespace: namespace
            },
            Period: period,
            Stat: "Sum"
        },
        ReturnData: true
    }

    const consumedWrites = {
        Id: "consumedWrite",
        MetricStat: {
            Metric: {
                Dimensions: [
                    {
                        Name: "TableName",
                        Value: params.tableName
                    }
                ],
                MetricName: "ConsumedWriteCapacityUnits",
                Namespace: namespace
            },
            Period: period,
            Stat: "Sum"
        },
        ReturnData: true
    }

    const throttledReads = {
        Id: "throttledReads",
        MetricStat: {
            Metric: {
                Dimensions: [
                    {
                        Name: "TableName",
                        Value: params.tableName
                    }
                ],
                MetricName: "ReadThrottleEvents",
                Namespace: namespace
            },
            Period: period,
            Stat: "Sum"
        },
        ReturnData: true
    }

    const throttledWrites = {
        Id: "throttledWrites",
        MetricStat: {
            Metric: {
                Dimensions: [
                    {
                        Name: "TableName",
                        Value: params.tableName
                    }
                ],
                MetricName: "WriteThrottleEvents",
                Namespace: namespace
            },
            Period: period,
            Stat: "Sum"
        },
        ReturnData: true
    }

    const provisionedReads = {
        Id: "provisionedReads",
        MetricStat: {
            Metric: {
                Dimensions: [
                    {
                        Name: "TableName",
                        Value: params.tableName
                    }
                ],
                MetricName: "ProvisionedReadCapacityUnits",
                Namespace: namespace
            },
            Period: period,
            Stat: "Average"
        },
        ReturnData: true
    }

    const provisionedWrites = {
        Id: "provisionedWrites",
        MetricStat: {
            Metric: {
                Dimensions: [
                    {
                        Name: "TableName",
                        Value: params.tableName
                    }
                ],
                MetricName: "ProvisionedWriteCapacityUnits",
                Namespace: namespace
            },
            Period: period,
            Stat: "Average"
        },
        ReturnData: true
    }

    const queries = [
        consumedReads,
        consumedWrites,
        throttledReads,
        throttledWrites,
        provisionedReads,
        provisionedWrites,
    ]

    // Our data gets pushed into here for each pagination call
    const data: { timestamp: Date, consumedRead: number, consumedWrite: number, throttledReads: number, throttledWrites: number, provisionedReads: number, provisionedWrites: number }[] = [];

    let nextToken = undefined
    do {
        const response = await cloudwatch.send(new GetMetricDataCommand({
            MetricDataQueries: queries,
            StartTime: params.startTime,
            EndTime: params.endTime,
            NextToken: nextToken,
            ScanBy: "TimestampAscending"
        }))
        nextToken = response.NextToken as any

        // console.log(response)

        if (!response.MetricDataResults) {
            throw new Error("Unexpected API response: missing MetricDataResults");
        }

        const consumedReadData = response.MetricDataResults[0];
        const consumedWriteData = response.MetricDataResults[1];
        const throttledReadsData = response.MetricDataResults[2];
        const throttledWritesData = response.MetricDataResults[3];
        const provisionedReadsData = response.MetricDataResults[4];
        const provisionedWritesData = response.MetricDataResults[5];


        for (let i = 0; i < consumedReadData.Timestamps!.length; i++) {
            const timestamp = new Date(consumedReadData.Timestamps![i]);
            const consumedRead = consumedReadData.Values![i] || 0;
            const consumedWrite = consumedWriteData.Values![i] || 0;
            const throttledReads = throttledReadsData.Values![i] || 0;
            const throttledWrites = throttledWritesData.Values![i] || 0;
            const provisionedReads = provisionedReadsData.Values![i] || 0;
            const provisionedWrites = provisionedWritesData.Values![i] || 0;

            data.push({ timestamp, consumedRead, consumedWrite, throttledReads, throttledWrites, provisionedReads, provisionedWrites });
        }
    }
    while (nextToken !== undefined)

    return data;
}