#!/bin/bash
# set -x
# set -e

# This script prints out a list of every DDB table name in a region.
# Useful for the first step in a data pipeline for running scaling config optimization for every table...

# Usage: print-table-names.sh REGION PROFILE_NAME
# REGION: AWS region like us-east-1
# PROFILE_NAME: string matching a named section in your ~/.aws/credentials file

# check if region and profile name were provided
if [ $# -ne 2 ]; then
    echo "Usage: $0 <region> <profile_name>"
    exit 1
fi

# get start and end times
region=$1
profile=$2

cd "$(dirname "$0")"
pushd ..

cat << EOF | npx ts-node 
import { getAllTableNames } from './table-consumption-fetcher'

(async()=>{
const names = await getAllTableNames({region: '$region', profile: '$profile'})
for (let n of names) {
  console.log(n)
}
})()
EOF

popd