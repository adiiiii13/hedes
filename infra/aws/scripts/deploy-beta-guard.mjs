import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const windowsAwsCli = 'C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe';
const aws = process.env.AWS_CLI_PATH || (existsSync(windowsAwsCli) ? windowsAwsCli : 'aws');
const isWindows = process.platform === 'win32';
const region = process.env.HEDES_AWS_REGION || 'ap-southeast-2';
const run = (command, args, options = {}) => spawnSync(command, args, {
  encoding: 'utf8',
  // Native executables can be spawned directly; shell parsing breaks paths
  // such as `C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe`.
  shell: isWindows && !/\.exe$/i.test(command),
  ...options,
});

const plan = run(aws, ['freetier', 'get-account-plan-state', '--region', 'us-east-1', '--output', 'json']);
if (plan.error || plan.status !== 0) {
  console.error('AWS beta deployment stopped: AWS CLI session is unavailable. Run `aws login`, then retry.');
  if (plan.stderr) console.error(plan.stderr.trim());
  process.exit(1);
}

let accountPlan;
try {
  accountPlan = JSON.parse(plan.stdout);
} catch {
  console.error('AWS beta deployment stopped: Free Plan status response was invalid.');
  process.exit(1);
}

const remaining = Number(accountPlan.accountPlanRemainingCredits?.amount);
if (accountPlan.accountPlanType !== 'FREE' || accountPlan.accountPlanStatus !== 'ACTIVE') {
  console.error('AWS beta deployment stopped: HEDES deploy requires active AWS Free account plan.');
  process.exit(1);
}
if (!Number.isFinite(remaining) || remaining < 30) {
  console.error(`AWS beta deployment stopped: keep at least $30 credit reserve; current balance is $${Number.isFinite(remaining) ? remaining.toFixed(2) : 'unknown'}.`);
  process.exit(1);
}

const origins = process.env.HEDES_BETA_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174';
const originPattern = /^(https:\/\/[A-Za-z0-9.-]+(?::\d+)?|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/;
if (origins.split(',').some((origin) => !originPattern.test(origin.trim()))) {
  console.error('AWS beta deployment stopped: origins must be HTTPS domains or localhost development origins.');
  process.exit(1);
}
const identity = run(aws, ['sts', 'get-caller-identity', '--output', 'json']);
if (identity.error || identity.status !== 0) {
  console.error('AWS beta deployment stopped: could not verify the signed-in AWS account.');
  if (identity.stderr) console.error(identity.stderr.trim());
  process.exit(1);
}
const accountId = JSON.parse(identity.stdout).Account;
if (!/^\d{12}$/.test(accountId ?? '')) {
  console.error('AWS beta deployment stopped: AWS returned an invalid account ID.');
  process.exit(1);
}

console.log(`Free account plan confirmed. Remaining credit: $${remaining.toFixed(2)}. Deploying beta only.`);
console.log(`Bootstrapping CDK in ${region} if needed. This creates small deployment support resources.`);
const bootstrap = run('npx', ['cdk', 'bootstrap', `aws://${accountId}/${region}`], {
  stdio: 'inherit',
  env: { ...process.env, CDK_DEFAULT_ACCOUNT: accountId, CDK_DEFAULT_REGION: region },
});
if (bootstrap.error) throw bootstrap.error;
if (bootstrap.status !== 0) process.exit(bootstrap.status ?? 1);

const deploy = run('npx', [
  'cdk', 'deploy', '-c', 'stage=beta', '-c', `allowedOrigins=${origins}`, '--require-approval', 'broadening',
], { stdio: 'inherit', env: { ...process.env, CDK_DEFAULT_ACCOUNT: accountId, CDK_DEFAULT_REGION: region } });
if (deploy.error) throw deploy.error;
process.exit(deploy.status ?? 1);
