# HEDES AWS beta foundation

This stack provisions the first cloud sync backend in `ap-south-1` (Mumbai): Cognito email sign-in, a JWT-protected HTTP API, private PostgreSQL, and a private S3 project-file bucket. CloudFormation/CDK owns all resources. No AWS resource is created by local tests or synthesis.

## Current API

Every route requires a Cognito JWT. The handler takes tenant identity only from the verified JWT `sub` claim. PostgreSQL also forces row-level security for every account-owned table. The API supports revision-checked, idempotent JSON sync for chats, council sessions, settings, memory and project metadata. Conflicting revisions are returned per record; accepted records in the same batch still save.

Project files use a five-minute signed S3 upload URL, an explicit completion check, a signed download URL and a delete route. Upload completion verifies owner metadata and byte count. Per-file limit is 25 MiB; per-account logical storage cap is 2 GiB. Unfinished, tagged uploads expire after one day. App code must use the returned `requiredHeaders` with the upload URL.

Routes:

- `GET /v1/me`
- `GET /v1/sync/pull?cursor=<opaque>&limit=100`
- `POST /v1/sync/push`
- `POST /v1/files/upload`
- `POST /v1/files/complete`
- `POST /v1/files/download`
- `POST /v1/files/delete`
- `GET /v1/files/list?projectId=<id>&limit=200&cursor=<opaque>`

Push body shape:

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

Use a new UUID `mutationId` for each logical batch and reuse that ID for retries. New records use `baseRevision: 0`. Use returned revisions for the next update. Records containing credential-shaped fields are rejected. Do not sync provider API keys, vault data, `.env`, `.git`, caches or `node_modules`.

## Beta resources and limits

Beta uses single-AZ `db.t4g.micro`, 20 GiB encrypted gp3, 10 concurrent Lambda executions, 4 DB connections per execution, API throttling at 10 requests/second with burst 20, 2 GiB logical file quota per account, and non-public RDS/S3. It pins RDS PostgreSQL 16.15, which AWS lists as a current supported version for RDS PostgreSQL 16. A free S3 Gateway Endpoint keeps S3 private without NAT Gateway charges. One Secrets Manager interface endpoint gives only the bootstrap function private access to the generated master secret; include its hourly charge in beta estimates. Normal sync calls use IAM database authentication and the current AWS Mumbai RDS CA bundle. Beta sign-up stays invite-only; production enables email sign-up.

The production CDK stage changes RDS to `db.t4g.small` Multi-AZ, retains data, enables S3 versioning, seven-day database backups and stronger concurrency limits. It is a starting profile, not a public-launch approval. Load tests, account recovery, deletion/export workflow, monitoring, verified email configuration, and client integration remain launch gates.

CloudWatch budget alerts are not hard spending caps. Review live AWS prices before deployment. No stack deployment has happened as part of coding.

The current AWS CDK release (`2.272.0`) bundles `brace-expansion@5.0.9`, which npm audit flags for a high-severity denial-of-service advisory. That package is part of the local CDK synthesis/deploy toolchain; it is not included in either Lambda bundle. npm overrides do not replace CDK's bundled copy. Re-run `npm audit` after each CDK update and update CDK when its bundled copy is patched.

## Deploy beta

Requirements: Node.js 22+, npm, AWS CLI v2, AWS account configured locally, and billing alerts set in the AWS account. Never put AWS access keys in source code or this chat. Use `aws configure sso` or `aws configure` on your computer; do not paste credentials into HEDES.

```powershell
cd infra/aws
npm ci
npm run build
npm test
$env:CDK_DEFAULT_ACCOUNT = (aws sts get-caller-identity --query Account --output text)
npx cdk bootstrap "aws://$env:CDK_DEFAULT_ACCOUNT/ap-south-1"
npx cdk synth -c stage=beta -c allowedOrigins="http://localhost:5174,http://127.0.0.1:5174"
npx cdk deploy -c stage=beta -c allowedOrigins="https://your-hedes-domain.example,http://localhost:5174,http://127.0.0.1:5174"
```

Replace the example HTTPS origin with the deployed HEDES web origin before public use. Cognito confirmation emails use the AWS default sender in beta; configure a verified SES domain and production email limits before inviting many users. Keep `cdk.context.json`, account IDs and deployment outputs private when sharing screenshots. The database bootstrap uses the RDS master secret only during schema setup; normal API requests use a separate IAM-authenticated `hedes_app` role and RLS. Increment `schemaVersion` on the `DatabaseSchema` custom resource when adding a new SQL migration.

## Verify / tear down

`npm run synth` and tests are safe and do not call AWS. `npm run deploy` creates billable cloud resources. For beta teardown, first export user data. The beta user pool and file bucket are retained; the database is snapshotted. Remove retained data only after verifying exports and account ownership.
