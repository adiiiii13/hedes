import assert from 'node:assert/strict';
import test from 'node:test';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { HedesCloudStack } from '../lib/hedes-cloud-stack.js';

test('beta stack uses on-demand tenant data, bounded requests, and private files', () => {
  const app = new App();
  const stack = new HedesCloudStack(app, 'TestBeta', { stage: 'beta', env: { account: '123456789012', region: 'ap-southeast-2' } });
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'hedes-beta-data',
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }, { AttributeName: 'SK', KeyType: 'RANGE' }],
    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    DeletionProtectionEnabled: true,
    GlobalSecondaryIndexes: Match.arrayWith([
      Match.objectLike({ IndexName: 'SyncByUpdate', KeySchema: [{ AttributeName: 'GSI1PK', KeyType: 'HASH' }, { AttributeName: 'GSI1SK', KeyType: 'RANGE' }] }),
      Match.objectLike({ IndexName: 'FilesByProject', KeySchema: [{ AttributeName: 'GSI2PK', KeyType: 'HASH' }, { AttributeName: 'GSI2SK', KeyType: 'RANGE' }] }),
    ]),
  });
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
    StageName: '$default',
    DefaultRouteSettings: { ThrottlingBurstLimit: 5, ThrottlingRateLimit: 2 },
  });
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs22.x',
    Environment: { Variables: Match.objectLike({ MAX_FILE_STORAGE_BYTES: '536870912', MAX_SYNC_STORAGE_BYTES: '104857600' }) },
  });
  const betaLambdas = Object.values(template.findResources('AWS::Lambda::Function')) as any[];
  assert.ok(betaLambdas.every((lambda) => !('ReservedConcurrentExecutions' in lambda.Properties)));
  template.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    LifecycleConfiguration: {
      Rules: Match.arrayWith([
        Match.objectLike({ AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } }),
        Match.objectLike({ ExpirationInDays: 1, TagFilters: [{ Key: 'hedes-state', Value: 'pending' }] }),
      ]),
    },
  });
  const routes = template.findResources('AWS::ApiGatewayV2::Route');
  assert.equal(Object.values(routes).length, 8);
  assert.ok(Object.values(routes).every((route: any) => route.Properties.AuthorizationType === 'JWT'));
  const policies = Object.values(template.findResources('AWS::IAM::Policy')) as any[];
  assert.ok(policies.some((policy) => JSON.stringify(policy.Properties.PolicyDocument.Statement).includes('dynamodb:TransactWriteItems')));
  assert.ok(policies.every((policy) => !JSON.stringify(policy.Properties.PolicyDocument.Statement).includes('dynamodb:Scan')));
  template.hasResourceProperties('AWS::Cognito::UserPool', { AdminCreateUserConfig: { AllowAdminCreateUserOnly: true } });
  template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    AllowedOAuthFlowsUserPoolClient: false,
    ExplicitAuthFlows: Match.arrayWith(['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']),
  });
  template.resourceCountIs('AWS::RDS::DBInstance', 0);
  template.resourceCountIs('AWS::EC2::VPC', 0);
  template.resourceCountIs('AWS::EC2::VPCEndpoint', 0);
});

test('production stack requires HTTPS origin and retains user data', () => {
  const app = new App({ context: { allowedOrigins: 'https://hedes.example.com,http://localhost:5173' } });
  const stack = new HedesCloudStack(app, 'TestProduction', { stage: 'production', env: { account: '123456789012', region: 'ap-southeast-2' } });
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', { DefaultRouteSettings: { ThrottlingBurstLimit: 20, ThrottlingRateLimit: 10 } });
  template.hasResourceProperties('AWS::Lambda::Function', { ReservedConcurrentExecutions: 40 });
  template.hasResourceProperties('AWS::S3::Bucket', { VersioningConfiguration: { Status: 'Enabled' } });
  template.hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
  template.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
  template.hasResource('AWS::Cognito::UserPool', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
});
