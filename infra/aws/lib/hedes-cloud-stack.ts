import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

interface HedesCloudStackProps extends StackProps {
  stage: 'beta' | 'production';
}

export class HedesCloudStack extends Stack {
  constructor(scope: Construct, id: string, props: HedesCloudStackProps) {
    super(scope, id, props);

    const production = props.stage === 'production';
    const appOrigins = String(this.node.tryGetContext('allowedOrigins') ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174')
      .split(',').map((origin) => origin.trim()).filter(Boolean);
    if (appOrigins.includes('*') || appOrigins.some((origin) => {
      try {
        const parsed = new URL(origin);
        const isLocalHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
        return parsed.origin !== origin || (parsed.protocol !== 'https:' && !isLocalHttp);
      } catch {
        return true;
      }
    })) throw new Error('Set allowedOrigins to comma-separated HTTPS origins; localhost HTTP is allowed for development');
    if (production && !appOrigins.some((origin) => origin.startsWith('https://'))) {
      throw new Error('Production deployments require at least one HTTPS HEDES origin');
    }

    const userPool = new cognito.UserPool(this, 'Users', {
      userPoolName: `hedes-${props.stage}-users`,
      selfSignUpEnabled: production,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const userClient = userPool.addClient('AppClient', {
      userPoolClientName: `hedes-${props.stage}-app`,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
      oAuth: { flows: { authorizationCodeGrant: false, implicitCodeGrant: false }, scopes: [] },
    });
    (userClient.node.defaultChild as cognito.CfnUserPoolClient)
      .addPropertyOverride('AllowedOAuthFlowsUserPoolClient', false);

    const dataTable = new dynamodb.Table(this, 'UserData', {
      tableName: `hedes-${props.stage}-data`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'expiresAt',
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });
    dataTable.addGlobalSecondaryIndex({
      indexName: 'SyncByUpdate',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    dataTable.addGlobalSecondaryIndex({
      indexName: 'FilesByProject',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const bucket = new s3.Bucket(this, 'ProjectFiles', {
      bucketName: undefined,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: production,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
        allowedOrigins: appOrigins,
        allowedHeaders: ['content-type', 'x-amz-*'],
        exposedHeaders: ['ETag'],
        maxAge: 300,
      }],
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
        {
          expiration: Duration.days(1),
          tagFilters: { 'hedes-state': 'pending' },
        },
        ...(production ? [{ noncurrentVersionExpiration: Duration.days(30) }] : []),
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const apiHandler = new nodejs.NodejsFunction(this, 'SyncApi', {
      entry: path.join(here, '../lambda/api-dynamodb.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(15),
      ...(production ? { reservedConcurrentExecutions: 40 } : {}),
      environment: {
        HEDES_STAGE: props.stage,
        DATA_TABLE: dataTable.tableName,
        FILES_BUCKET: bucket.bucketName,
        MAX_SYNC_BYTES: '262144',
        MAX_FILE_BYTES: String(25 * 1024 * 1024),
        MAX_FILE_STORAGE_BYTES: String(512 * 1024 * 1024),
        MAX_SYNC_STORAGE_BYTES: String(100 * 1024 * 1024),
      },
      bundling: { minify: true, sourceMap: true, target: 'node22', externalModules: [] },
    });
    apiHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query', 'dynamodb:TransactWriteItems'],
      resources: [dataTable.tableArn, `${dataTable.tableArn}/index/*`],
    }));
    apiHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:PutObjectTagging', 's3:GetObject', 's3:DeleteObject'],
      resources: [bucket.arnForObjects('users/*')],
    }));

    const api = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `hedes-${props.stage}-api`,
      description: 'Authenticated HEDES sync and project file API',
      corsPreflight: {
        allowHeaders: ['authorization', 'content-type', 'x-hedes-client-version'],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.PUT],
        allowOrigins: appOrigins,
        maxAge: Duration.hours(1),
      },
      createDefaultStage: false,
    });
    new apigwv2.HttpStage(this, 'DefaultStage', {
      httpApi: api,
      stageName: '$default',
      autoDeploy: true,
      throttle: { burstLimit: production ? 20 : 5, rateLimit: production ? 10 : 2 },
    });
    const authorizer = new authorizers.HttpUserPoolAuthorizer('HedesUserAuthorizer', userPool, { userPoolClients: [userClient] });
    const integration = new integrations.HttpLambdaIntegration('SyncIntegration', apiHandler);
    for (const route of [
      { path: '/v1/me', methods: [apigwv2.HttpMethod.GET] },
      { path: '/v1/sync/pull', methods: [apigwv2.HttpMethod.GET] },
      { path: '/v1/sync/push', methods: [apigwv2.HttpMethod.POST] },
      { path: '/v1/files/upload', methods: [apigwv2.HttpMethod.POST] },
      { path: '/v1/files/complete', methods: [apigwv2.HttpMethod.POST] },
      { path: '/v1/files/delete', methods: [apigwv2.HttpMethod.POST] },
      { path: '/v1/files/download', methods: [apigwv2.HttpMethod.POST] },
      { path: '/v1/files/list', methods: [apigwv2.HttpMethod.GET] },
    ]) {
      api.addRoutes({ path: route.path, methods: route.methods, integration, authorizer });
    }

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userClient.userPoolClientId });
    new CfnOutput(this, 'DataTableName', { value: dataTable.tableName });
    new CfnOutput(this, 'ProjectBucketName', { value: bucket.bucketName });
  }
}
