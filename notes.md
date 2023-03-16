# TODOs
- write code to glue table-consumption-fetcher response into ddb-sim tableCapacity.process() ticks
- get tableCapacity stats after each tick as output for graph
- graph requests and tableCapacity stats log

## Inputs
CW read usage + CW read throttled count
CW write usage + CW write throttled count
Provisioned Capacity min/max/target util config

## Outputs
Graph of requests, throttled requests, and provisioned capacity over time


