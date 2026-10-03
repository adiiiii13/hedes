#!/usr/bin/env node
import 'source-map-support/register.js';
import { App } from 'aws-cdk-lib';
import { HedesCloudStack } from '../lib/hedes-cloud-stack.js';

const app = new App();
const stage = app.node.tryGetContext('stage') ?? 'beta';
if (!['beta', 'production'].includes(stage)) {
  throw new Error('CDK context stage must be beta or production');
}

new HedesCloudStack(app, `Hedes-${stage}`, {
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-south-1',
  },
});
