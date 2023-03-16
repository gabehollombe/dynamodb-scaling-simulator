import { fromIni } from "@aws-sdk/credential-providers";
import { CloudWatchClient, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";

type params = {
    profile: string
    region: string
    tableName: string
    startTime: Date
    endTime: Date
}

export async function fetchTableMetrics(params: params): Promise<{ timestamp: Date, consumedRead: number, consumedWrite: number, throttledReads: number, throttledWrites: number }[]> {
    const cloudwatch = new CloudWatchClient({ 
        region: params.region,
        credentials: fromIni({profile: params.profile})
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

    const throttledReads =  {
        Id: "throttledReads",
        MetricStat: {
            Metric: {
                Dimensions: [
                    {
                        Name: "TableName",
                        Value: params.tableName
                    }
                ],
                MetricName: "ThrottledRequests",
                Namespace: namespace
            },
            Period: period,
            Stat: "Sum"
        },
        ReturnData: true
    }

    const throttledWrites =              {
        Id: "throttledWrites",
        MetricStat: {
            Metric: {
                Dimensions: [
                    {
                        Name: "TableName",
                        Value: params.tableName
                    }
                ],
                MetricName: "ThrottledRequests",
                Namespace: namespace
            },
            Period: period,
            Stat: "Sum"
        },
        ReturnData: true
    }

    const queries = [
        consumedReads, 
        consumedWrites, 
        throttledReads, 
        throttledWrites
    ]

    // Our data gets pushed into here for each pagination call
    const data: { timestamp: Date, consumedRead: number, consumedWrite: number, throttledReads: number, throttledWrites: number }[] = [];

    let nextToken = undefined
    do  {
        const response = await cloudwatch.send(new GetMetricDataCommand({
            MetricDataQueries: queries,
            StartTime: params.startTime,
            EndTime: params.endTime,
            NextToken: nextToken,
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
        
        
        for (let i = 0; i < consumedReadData.Timestamps!.length; i++) {
            const timestamp = new Date(consumedReadData.Timestamps![i]);
            const consumedRead = consumedReadData.Values![i];
            const consumedWrite = consumedWriteData.Values![i];
            const throttledReads = throttledReadsData.Values![i];
            const throttledWrites = throttledWritesData.Values![i];
            
            data.push({ timestamp, consumedRead, consumedWrite, throttledReads, throttledWrites });
        }
    }
    while (nextToken !== undefined)
    
    return data;
}