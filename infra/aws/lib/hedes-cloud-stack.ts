import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  CustomResource,
  type StackProps,
} from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cr from 'aws-cdk-lib/custom-resources';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
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
    const databaseRemovalPolicy = production ? RemovalPolicy.RETAIN : RemovalPolicy.SNAPSHOT;
    const appOrigins = String(this.node.tryGetContext('allowedOrigins') ?? 'http://localhost:5174,http://127.0.0.1:5174')
      .split(',').map((origin) => origin.trim()).filter(Boolean);
    if (appOrigins.includes('*') || appOrigins.some((origin) => {
      try {
        const parsed = new URL(origin);
        const isLocalHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
        return parsed.origin !== origin || (parsed.protocol !== 'https:' && !isLocalHttp);
      } catch {
        return true;
      }
    })) {
      throw new Error('Set allowedOrigins to comma-separated HTTPS origins; localhost HTTP is allowed for development');
    }
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });

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
      oAuth: { flows: {}, scopes: [] },
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
          expiration: Duration.days(1),
          tagFilters: { 'hedes-state': 'pending' },
        },
        ...(production ? [{ noncurrentVersionExpiration: Duration.days(30) }] : []),
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.of('16.15', '16') }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        production ? ec2.InstanceSize.SMALL : ec2.InstanceSize.MICRO,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      allocatedStorage: 20,
      maxAllocatedStorage: production ? 100 : 30,
      storageType: rds.StorageType.GP3,
      multiAz: production,
      publiclyAccessible: false,
      iamAuthentication: true,
      databaseName: 'hedes',
      backupRetention: production ? Duration.days(7) : Duration.days(1),
      deletionProtection: production,
      storageEncrypted: true,
      autoMinorVersionUpgrade: true,
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: production ? 30 : 7,
      removalPolicy: databaseRemovalPolicy,
    });

    const bootstrapHandler = new nodejs.NodejsFunction(this, 'DatabaseBootstrap', {
      entry: path.join(here, '../lambda/bootstrap.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.minutes(2),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED, onePerAz: true },
      environment: {
        DB_HOST: database.dbInstanceEndpointAddress,
        DB_PORT: database.dbInstanceEndpointPort,
        DB_NAME: 'hedes',
        DB_MASTER_SECRET_ARN: database.secret!.secretArn,
      },
      bundling: { minify: true, sourceMap: true, target: 'node22', loader: { '.sql': 'text', '.pem': 'text' }, externalModules: [] },
    });
    database.connections.allowDefaultPortFrom(bootstrapHandler, 'TLS database bootstrap');
    database.secret!.grantRead(bootstrapHandler);
    const secretsEndpoint = vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnets: [vpc.isolatedSubnets[0]] },
    });
    secretsEndpoint.connections.allowDefaultPortFrom(bootstrapHandler, 'Bootstrap Lambda reads generated RDS secret');
    const bootstrapProvider = new cr.Provider(this, 'DatabaseBootstrapProvider', {
      onEventHandler: bootstrapHandler,
    });
    const databaseSchema = new CustomResource(this, 'DatabaseSchema', {
      serviceToken: bootstrapProvider.serviceToken,
      properties: { schemaVersion: '1' },
    });
    databaseSchema.node.addDependency(database);
    databaseSchema.node.addDependency(secretsEndpoint);

    const apiHandler = new nodejs.NodejsFunction(this, 'SyncApi', {
      entry: path.join(here, '../lambda/api.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(15),
      reservedConcurrentExecutions: production ? 40 : 10,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED, onePerAz: true },
      environment: {
        HEDES_STAGE: props.stage,
        DB_HOST: database.dbInstanceEndpointAddress,
        DB_PORT: database.dbInstanceEndpointPort,
        DB_NAME: 'hedes',
        DB_USER: 'hedes_app',
        DB_IAM_AUTH: 'true',
        DB_POOL_MAX: production ? '8' : '4',
        FILES_BUCKET: bucket.bucketName,
        MAX_SYNC_BYTES: '262144',
        MAX_FILE_BYTES: String(25 * 1024 * 1024),
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
        loader: { '.pem': 'text' },
        externalModules: [],
      },
    });
    database.connections.allowDefaultPortFrom(apiHandler, 'TLS PostgreSQL from sync API');
    bucket.grantPut(apiHandler, 'users/*');
    bucket.grantRead(apiHandler, 'users/*');
    apiHandler.addToRolePolicy(new PolicyStatement({
      actions: ['s3:PutObjectTagging', 's3:PutObjectVersionTagging', 's3:DeleteObject', 's3:DeleteObjectVersion'],
      resources: [bucket.arnForObjects('users/*')],
    }));
    apiHandler.addToRolePolicy(new PolicyStatement({
      actions: ['rds-db:connect'],
      resources: [`${database.instanceResourceId}/hedes_app`],
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
      throttle: { burstLimit: production ? 40 : 20, rateLimit: production ? 25 : 10 },
    });
    const authorizer = new authorizers.HttpUserPoolAuthorizer('HedesUserAuthorizer', userPool, {
      userPoolClients: [userClient],
    });
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
      api.addRoutes({
        path: route.path,
        methods: route.methods,
        integration,
        authorizer,
      });
    }

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userClient.userPoolClientId });
    new CfnOutput(this, 'DatabaseEndpoint', { value: database.dbInstanceEndpointAddress });
    new CfnOutput(this, 'ProjectBucketName', { value: bucket.bucketName });
  }
}
