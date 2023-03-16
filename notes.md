# JS notes
try https://www.npmjs.com/package/circular-buffer 

# Inputs
CW read usage + CW read throttled count
CW write usage + CW write throttled count
Provisioned Capacity min/max/target util config



# Algorithm

amount_provisioned = config.min_capacity
burst_buckets = ring buffer of length 5 full of 0's
past_utilizations = ring buffer of length 15 all 0s
throttled_events = [] // track timestamps of throttles

Loop for each minute in time frame from earliest input timestamp to last input timestamp

amount_over = amount_requested - amount_provisioned
if amount_over > 0
    // CONSUME FROM BURST IF WE CAN
	burst_consumed = min(amount_over, get_total_burst_available()) // returns ring buffer sum
    consume_from_bursts(burst_consumed) // draws down from ring buffer, oldest first
    amount_remaining_after_burst_consumed = amount_over - burst_consumed

    if amount_remaining_after_burst_consumed > 0
        // THROTTLE REQUEST
        throttled_events.push(timestamp)
else
    // ADD UNUSED CAPACITY TO BURST
	amount_under = amount_provisioned - amount_requested
    slide_bursts_and_add(amount_under) // drops oldest burst bucket and adds in new one

if past_utilizations_ago(1) > config.target_utilization AND past_utilizations_ago(2) > config.target_utilization
    // SCALE UP
    amount_provisioned += amount_requested * target_utilization

if all_past_utilizations_below(config.target_utilization)
    // SCALE DOWN
    amount_provisioned -= amount_requested * target_utilization 

slide_past_utilizations_and_add(current_utilization)


# Outputs
Graph of throttled requests
