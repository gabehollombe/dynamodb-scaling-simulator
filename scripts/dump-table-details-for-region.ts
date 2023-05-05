import { getAllTableDetails } from "../table-consumption-fetcher";

const args = process.argv.slice(2)
if (args.length !== 3) {
    console.log('Must pass: region profile roleArn')
    process.exit(1)
}
const [region, profile, roleArn] = args

async function main(){
    process.stderr.write(`Fetching all table details for ${region} via role ${roleArn}\n`)
    const allTableDetails = await getAllTableDetails({region, profile, roleArn})

    console.log(JSON.stringify(allTableDetails))
}

main()