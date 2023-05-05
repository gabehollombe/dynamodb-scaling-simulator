import { AssumeRoleCommand, AssumeRoleCommandOutput, Credentials } from "@aws-sdk/client-sts";
import { STSClient } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";
import { AwsCredentialIdentity } from "@aws-sdk/types";

export async function getCredentialsFromAssumingRole(region: string, profile: string, roleArn: string): Promise<AwsCredentialIdentity|undefined> {
    const client = new STSClient({ region, credentials: fromIni({ profile }) }) //, credentials: fromIni({ profile: 'pd-staging' }) })
    const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "session1",
        DurationSeconds: 60 * 60,
    })
    const response: AssumeRoleCommandOutput = await client.send(command)
    return {
        accessKeyId: response.Credentials?.AccessKeyId!,
        secretAccessKey: response.Credentials?.SecretAccessKey!,
        sessionToken: response.Credentials?.SessionToken!,
    }
}