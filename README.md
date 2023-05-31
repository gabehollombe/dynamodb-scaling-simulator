
## This is Beta software.

## The tool might have bugs, but the info it provides has proven helpful in its current state, even if it may not be the best it can be.

# DynamoDB Scaling Simulator

## What's this?
This repo contains a tool to help you simulate how a provisioned-capacity DynamoDB table will perform (will it throttle requests or not?) under different auto-scaling configurations. 

It will also try to calculate the best config for you that results in the lowest cost and no throttles.

## How do I use it?
1. Clone this repo

1. Ensure you have Node.js and NPM installed

1. Run `npm install` to get the dependenicies

1. Launch the GUI via `npm start`

1. Look for the URL that Parcel is hosting the build at and open it in your browser. Defaults to http://localhost:1234

1. Follow the instructions in the GUI. Use the first form to get data from CloudWatch, then the second form to configure scaling simulator settings and generate graphs and recommented optimal scaling configs for reads and writes.

1. If you're interested in trying iterations of your own guessed configurations, look at the graph for any simulated throttled events. This is probably what you want to avoid.

## How does it work?
This tool...
1. Uses historic CloudWatch metrics data for the table, for the configured time range (`ConsumedReadCapacityUnits`, `ConsumedWriteCapacityUnits`, `ReadThrottleEvents`,  `WriteThrottleEvents`)

2. Instantiates a new simulated table with a given auto-scaling config (min capacity, max capacity, target utilization).

3. Calculates the average per-second demand based on each minute's total read/write demand for the table (summing Consumed + Throttled metrics for reads and writes, respectively)

4. Feeds each minute's average per-second demand into the simulated table

5. Records the results of serving that minute of demand (amount of capacity successfully consumed, amount of requested capacity that was throttled)

6. Graphs these metrics and calculates avg daily cost for your scaling config

7. Also attempts to 'solve' for an optimized scaling config that results in no throttles and has the lowest price.


## Important Caveats. This tool...
- Does not think about hot partitions as a reason to throttle. Only considers total capacity avaialble vs requested.

- Gets CloudWatch at the minute-level and we simulate by calculating the average demand per second for that minute (total demand for the minute / 60). This means that if there was a 'micro burst' of a few seconds of super high demand on the table and the rest of the minute was relatively quiet, we'll see a low average here. In reality, some of that 'micro burst' should be throttled in the simulator but we can't simulate at the second level of granularity because we lack the data. 

    So just be aware that **while this simulation still pretty helpful, it's not anything close to a promise of what actually happened**.

- Correctly simulates scaling up (when last 2 minutes of usage are higher than provisioned capacity) and down (when last 15 mintues are all at a utilization that is at least 20% lower than the target utilization), according to [this knowledge base article](https://aws.amazon.com/premiumsupport/knowledge-center/dynamodb-auto-scaling/). However, it requires you to configure how long of a delay you want to simulate between when the table _wants_ to scale and when that scaling event actually occurs.
  
- Doesn't know DDB's exact scaling algorithm, so it does something simple and just sets the new capacity based on the most recently requested utilization and the target utilization.  
        
    DDB's scaling algorithm _probably_ will scale up more aggressively if it also sees recent throttles?

- Currently only simulates the default scaledown limits: 4 in 1st hour, 1 each additional hour)

## TODOs
- [ ] Try calculating scaledown targets by looking at the last 60 minute average rather than the most recent requested amount (this may be more like what DDB actually does?)

- [ ] Show warning if user tries to use < 20% or > 90% target utilization (DDB only supports values inside this range)

- [ ] Show Standard and Infrequent Access costs (don't just assume Standard)

- [ ] Integrate pricing API instead of asking users to put the prices in

## Ideas

- Show a side-by-side view in the GUI between actual vs simulated

- Let the tool look at _all_ of your tables in an account, decide on 'optimal' scaling configs for each table, and calculate potential total cost savings 😀
