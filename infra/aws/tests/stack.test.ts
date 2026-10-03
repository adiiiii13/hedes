import assert from 'node:assert/strict';
import test from 'node:test';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { HedesCloudStack } from '../lib/hedes-cloud-stack.js';

test('beta stack keeps RDS and files private with bounded capacity', () => {
  const app = new App();
  const stack = new HedesCloudStack(app, 'TestBeta', { stage: 'beta', env: { account: '123456789012', region: 'ap-south-1' } });
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::RDS::DBInstance', {
    DBInstanceClass: 'db.t4g.micro',
    Engine: 'postgres',
    EngineVersion: '16.15',
    PubliclyAccessible: false,
    StorageEncrypted: true,
    EnableIAMDatabaseAuthentication: true,
    MultiAZ: false,
  });
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
    StageName: '$default',
    DefaultRouteSettings: { ThrottlingBurstLimit: 20, ThrottlingRateLimit: 10 },
  });
  template.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
  const routes = template.findResources('AWS::ApiGatewayV2::Route');
  assert.ok(Object.values(routes).length >= 7);
  assert.ok(Object.values(routes).every((route: any) => route.Properties.AuthorizationType === 'JWT'));
  const iamPolicies = template.findResources('AWS::IAM::Policy');
  assert.ok(JSON.stringify(iamPolicies).includes('s3:DeleteObjectVersion'));
  template.hasResourceProperties('AWS::Cognito::UserPool', {
    AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
  });
  template.resourceCountIs('AWS::EC2::NatGateway', 0);
  template.resourceCountIs('AWS::EC2::VPCEndpoint', 2);
});

test('production stage turns on multi-AZ and retains database and user data', () => {
  const app = new App();
  const stack = new HedesCloudStack(app, 'TestProduction', { stage: 'production', env: { account: '123456789012', region: 'ap-south-1' } });
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::RDS::DBInstance', {
    DBInstanceClass: 'db.t4g.small',
    PubliclyAccessible: false,
    StorageEncrypted: true,
    DeletionProtection: true,
    MultiAZ: true,
  });
  template.hasResourceProperties('AWS::S3::Bucket', { VersioningConfiguration: { Status: 'Enabled' } });
  template.hasResource('AWS::RDS::DBInstance', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
  template.hasResource('AWS::Cognito::UserPool', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
});
