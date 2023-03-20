
--------
# This is Alpha software. It probably has bugs. Use at your own risk.
--------

# DynamoDB Scaling Simulator

## What's this?
This repo contains a tool to help you simulate how a provisioned-capacity DynamoDB table will perform (will it throttle requests or not?) under different auto-scaling configurations.

## How does it work?
The repo contains a script (see `example_main.ts`) which sets up some config (AWS region, DynamoDB table name, start and end date ranges, and an auto-scaling configuration). 

You need to edit these config values in the script, then run it.

When you run the script, it will...
1. Pulls down the historic CloudWatch metrics data for the table, for the configured time range (`ConsumedReadCapacityUnits`, `ConsumedWriteCapacityUnits`, `ReadThrottleEvents`,  `WriteThrottleEvents`)
2. Instantiates a new simulated table with a given auto-scaling config (min capacity, max capacity, target utilization).
3. Calculates each minute's total read/write demand for the table (summing Consumed + Throttled metrics for reads and writes, respectively)
4. Feeds each minute's total demand into the simulated table
5. Records the results of serving that minute of demand (amount of capacity successfully consumed, amount of requested capacity that was throttled)
6. Graphs these metrics for you to look at


## Caveats
- Does not yet simulate maximum numbers of downscales per day.
- Does not think about hot partitions as a reason to throttle. Only considers total capacity avaialble vs requested.
- Correctly simulates scaling up (when last 2 minutes of usage are higher than provisioned capacity) and down (when last 15 mintues are all at a utilization that is at least 20% lower than the target utilization), according to [this knowledge base article](https://aws.amazon.com/premiumsupport/knowledge-center/dynamodb-auto-scaling/). However, it scales _instantly_ up/down to the new capacity based on the target utilization. This is probably not how Dynamo actually behaves with regards to making new capacity decisions and latency in making those new capacities actually available for requests.
  - I _think_ that DDB's scaling algorithm will scale up more aggressively if it also sees recent throttles?

## TODOs
- [ ] Cache CloudWatch data locally for subsequent runs on the same table/dateranges

- [ ] Show warning if user tries to use < 20% or > 90% target utilization (DDB only supports values inside this range)

- [ ] Work on importing from CSV, generating URL to download CSV from web console with these metrics (replace TABLE_NAME and REGION). Also be sure to check avg vs sum in stats below and do any math we need to...:

    ```
    {
        "metrics": [
            [ "AWS/DynamoDB", "ProvisionedReadCapacityUnits", "TableName", "TABLE_NAME", { "stat": "Average" } ],
            [ "AWS/DynamoDB", "ProvisionedReadCapacityUnits", "TableName", "TABLE_NAME", { "stat": "Average" } ],
            [ "AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", "TABLE_NAME", { "stat": "Sum" } ],
            [ "AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", "TABLE_NAME", { "stat": "Sum" } ],
            [ "AWS/DynamoDB", "ReadThrottleEvents", "TableName", "TABLE_NAME", { "stat": "Sum" } ],
            [ "AWS/DynamoDB", "WriteThrottleEvents", "TableName", "TABLE_NAME", { "stat": "Sum" } ]
        ],
        "title": "Provisioned, Consumed, Throttled",
        "view": "timeSeries",
        "stacked": false,
        "region": "REGION",
        "period": 60,
        "yAxis": {
            "left": {
                "showUnits": false
            }
     }
    ```

## Ideas
- Auto "solve" for different configs that result in zero throttles and optimize for price.
- Plug into the AWS Pricing API so we can know accurate prices based on table's region
- Let the tool look at _all_ of your tables in an account, decide on 'optimal' scaling configs for each table, and calculate potential total cost savings 😀