
--------
# This is Alpha software. It probably has bugs. Use at your own risk.
--------

# DynamoDB Scaling Simulator

## What's this?
This repo contains a tool to help you simulate how a provisioned-capacity DynamoDB table will perform (will it throttle requests or not?) under different auto-scaling configurations.

## How do I use it?
1. Clone this repo

1. Ensure you have Node.js and NPM installed

1. Run `npm install` to get the dependenicies

1. Launch the GUI via `npx parcel index.html`

## How does it work?
This tool...
1. Uses historic CloudWatch metrics data for the table, for the configured time range (`ConsumedReadCapacityUnits`, `ConsumedWriteCapacityUnits`, `ReadThrottleEvents`,  `WriteThrottleEvents`)

2. Instantiates a new simulated table with a given auto-scaling config (min capacity, max capacity, target utilization).

3. Calculates each minute's total read/write demand for the table (summing Consumed + Throttled metrics for reads and writes, respectively)

4. Feeds each minute's total demand into the simulated table

5. Records the results of serving that minute of demand (amount of capacity successfully consumed, amount of requested capacity that was throttled)

6. Graphs these metrics for you to look at


## Caveats
- Does not think about hot partitions as a reason to throttle. Only considers total capacity avaialble vs requested.

- Correctly simulates scaling up (when last 2 minutes of usage are higher than provisioned capacity) and down (when last 15 mintues are all at a utilization that is at least 20% lower than the target utilization), according to [this knowledge base article](https://aws.amazon.com/premiumsupport/knowledge-center/dynamodb-auto-scaling/). However, it requires you to configure how long of a delay you want to simulate between when the table _wants_ to scale and when that scaling event actually occurs.
  
- Doesn't know DDB's exact scaling algorithm, so it does something simple and just sets the new capacity based on the most recently requested utilization and the target utilization.  
        
    I _think_ that DDB's scaling algorithm will scale up more aggressively if it also sees recent throttles?

- Currently it only simulates the default scaledown limits: 4 in 1st hour, 1 each additional hour)

## TODOs
- [ ] Try calculating scaledown targets by looking at the last 60 minute average rather than the most recent requested amount (this may be more like what DDB actually does?)

- [ ] Show warning if user tries to use < 20% or > 90% target utilization (DDB only supports values inside this range)

- [ ] Cache CloudWatch data locally for subsequent runs on the same table/dateranges

## Ideas
- Auto "solve" for different configs that result in zero throttles and optimize for price.

- Plug into the AWS Pricing API so we can know accurate prices based on table's region

- Let the tool look at _all_ of your tables in an account, decide on 'optimal' scaling configs for each table, and calculate potential total cost savings 😀