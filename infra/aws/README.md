# HEDES AWS beta

This stack runs in `ap-southeast-2` (Sydney), the provisioned project Region shown in this AWS Free account. AWS's new account experience manages its organization policies; the Organizations console is intentionally unavailable. Deploy only to the selected project Region. It uses Cognito sign-in, an authenticated HTTP API, on-demand DynamoDB, and a private S3 bucket. It has no always-on database, NAT gateway, or VPC endpoint. The beta stack is invite-only and rate-limited.

## Data protection

Every API route requires a Cognito JWT. The API derives the tenant key only from the verified JWT `sub` claim. All DynamoDB rows use that tenant partition key; API IAM access is limited to the data table and its two indexes. Project objects use `users/<verified-sub>/<project-id>/<file-id>` keys, private bucket access, and signed five-minute URLs.

The DynamoDB table uses on-demand capacity, point-in-time recovery, deletion protection, and a 30-day TTL for idempotency records and deleted file metadata. The S3 bucket blocks public access, encrypts objects, and expires unfinished uploads tagged `hedes-state=pending` after one day. The stack retains the table, bucket, and user pool on stack removal to protect user data.

The API accepts at most 50 records per sync batch, 256 KiB per request, 100 MiB of sync data per account, 25 MiB per file, and 512 MiB of files per account. Beta API Gateway limits traffic to 2 requests/second with a burst of 5; the Lambda concurrency limit is 10. These application quotas bound storage and request rates. CloudWatch logs and network transfer still depend on actual use.

Sync records use optimistic revisions and stable mutation IDs. A failed retry reuses its ID; edits from two devices return conflicts instead of overwriting each other. Cursor pagination uses the DynamoDB update index. Tombstones and files have separate retention rules.

## Routes

- `GET /v1/me`
- `GET /v1/sync/pull?cursor=<opaque>&limit=100`
- `POST /v1/sync/push`
- `POST /v1/files/upload`
- `POST /v1/files/complete`
- `POST /v1/files/download`
- `POST /v1/files/delete`
- `GET /v1/files/list?projectId=<id>&limit=100&cursor=<opaque>`

Push body example:

```json
{
  "mutationId": "c0a8012e-b662-4c7b-90eb-aed2f4a12c57",
  "records": [
    {
      "type": "chats",
      "id": "chat-123",
      "baseRevision": 0,
      "clientUpdatedAt": 1791032400000,
      "deleted": false,
      "payload": { "title": "Example", "messages": [] }
    }
  ]
}
```

Credential-shaped fields are rejected recursively. Never sync provider API keys, vault data, `.env`, `.git`, caches, or `node_modules`.

## AWS $100 credit protection

The deploy command runs a preflight check. It refuses to deploy unless AWS reports an active `FREE` account plan with at least $30 remaining, and it deploys only the beta stage. It then bootstraps CDK in the provisioned Sydney Region if needed. The Free plan prevents out-of-pocket charges while active; AWS closes the account when credits are depleted or the plan duration ends. This is not a hard resource-spend cap, so monitor the credit balance in AWS Settings.

AWS documents that the Free account plan incurs no charges while active; it ends after six months or when credits are depleted, then the account closes. Do not upgrade to the Paid plan or join AWS Organizations/Control Tower: AWS says these actions can automatically upgrade the account. After the Free plan closes, HEDES cloud sync stops until the account is upgraded. Keep local HEDES backups current.

This serverless design avoids fixed RDS and interface-endpoint hourly costs. The Free plan's managed policies allow supported services only in the account's selected Region. Credit usage depends on request volume, stored bytes, point-in-time recovery data, S3 requests, logs, and data transfer. At the configured storage maxima, 100 accounts could use up to 50 GiB in S3 and 10 GiB in DynamoDB; request traffic and backup history add usage. Check the credit balance in AWS Settings after deployment and before inviting users.

Sources: [AWS Free account plan](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html), [AWS Free Tier service availability](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html), [AWS project Region](https://docs.aws.amazon.com/accounts/latest/reference/project-regions.html), [AWS managed organization policies](https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html).

## HEDES app configuration

After beta deployment, copy these public outputs into the HEDES root `.env`:

```dotenv
VITE_HEDES_CLOUD_API_URL=https://<api-id>.execute-api.ap-southeast-2.amazonaws.com
VITE_HEDES_CLOUD_USER_POOL_ID=ap-southeast-2_<pool-id>
VITE_HEDES_CLOUD_CLIENT_ID=<app-client-id>
```

Restart or rebuild HEDES after changing `.env`. Local Electron uses `localhost:5173`; Vite development uses `localhost:5174`. Beta accounts remain invite-only. Provision invited users with `aws cognito-idp admin-create-user` after deployment; do not enable public sign-up until account recovery and abuse controls are reviewed.

The Cloud Sync screen currently uploads chat and Council transcript text only after the user selects sync. It excludes message images and local file contents. Project-file APIs exist, but HEDES has no file sync controls yet. Do not describe file sync as available until that client path is implemented and verified.

## Build, test, synthesize

From `infra/aws`:

```powershell
npm ci
npm run build
npm test
npm run synth
```

These commands do not create AWS resources. `npm run deploy` performs the guarded beta deployment. Requirements: Node.js 22+, npm, AWS CLI v2, and an active Free-plan AWS CLI session. Run `aws login` first. If sign-in reports `signin:CreateOAuth2Token` permission denied, the selected IAM identity needs AWS's `SignInLocalDevelopmentAccess` managed policy. Do not paste AWS credentials into HEDES, source files, or chat.

Set `HEDES_BETA_ORIGINS` only to comma-separated HTTPS origins or localhost origins. Public web hosting is not part of this beta deployment. Production stage requires at least one HTTPS origin and is not deployable through the guarded `npm run deploy` command. The Free account experience manages its organization policies; do not try to edit them or activate advanced features for this beta.

For retained user data cleanup, export and verify user data first. Then delete DynamoDB table and S3 bucket contents explicitly through AWS console/CLI. Stack removal alone retains those resources by design.

The current AWS CDK release (`2.272.0`) bundles `brace-expansion@5.0.9`, which npm audit flags for a high-severity denial-of-service advisory. It is local infrastructure tooling and is not bundled into the Lambda function. Re-run `npm audit` after CDK updates.
