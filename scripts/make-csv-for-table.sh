#!/bin/bash
# set -x
# set -e

# This script prints out a CSV file for the given profile/region/table
# Useful for passing into the simulator to get an optimized config and cost estimate

# Usage: make-csv-for-table.sh PROFILE_NAME REGION TABLE START END
# PROFILE_NAME: string matching a named section in your ~/.aws/credentials file
# REGION: AWS region like us-east-1
# TABLE: DDB table like my_ddb_table_name
# START: ISO datetime string like 2001-02-03:11:22:33.000Z
# END: ISO datetime string like 2001-02-03:11:22:33.000Z

# check if args exist
if [ $# -ne 5 ]; then
    echo "Usage: $0 <profile> <region> <table> <start> <end>"
    exit 1
fi

# assign args
profile=$1
region=$2
table_name=$3
from=$4
to=$5

# setup working dir
cd "$(dirname "$0")"
pushd ..

cat << EOF | npx ts-node 
import { fetchTableMetrics } from './table-consumption-fetcher'

(async()=>{

const startTime = new Date(Date.parse('$from'))
const endTime =   new Date(Date.parse('$to'))
const stats = await fetchTableMetrics({
    profile: '$profile',
    region: '$region',
    tableName: '$table_name', 
    startTime,
    endTime,
})

})()
EOF