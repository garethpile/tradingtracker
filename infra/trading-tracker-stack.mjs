import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import { aws_apigateway as apigateway } from 'aws-cdk-lib';
import { aws_cloudfront as cloudfront } from 'aws-cdk-lib';
import { aws_cloudfront_origins as origins } from 'aws-cdk-lib';
import { aws_cognito as cognito } from 'aws-cdk-lib';
import { aws_dynamodb as dynamodb } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_lambda as lambda } from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import { aws_s3_deployment as s3deploy } from 'aws-cdk-lib';
import { aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
import { Construct } from 'constructs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

export class TradingTrackerStack extends cdk.Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const commonTags = {
      Project: 'TradingTracker',
      Application: 'TradingTrackerWeb',
      Environment: 'prod',
      ManagedBy: 'CDK',
      CostCenter: 'Trading',
      Owner: 'Pile',
      Repository: 'garethpile/tradingtracker',
    };

    Object.entries(commonTags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    const table = new dynamodb.Table(this, 'TradingTrackerTable', {
      tableName: 'tradingtracker-prod-sessions',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      deletionProtection: true,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const telegramSecret = new secretsmanager.Secret(this, 'TelegramSecret', {
      secretName: 'tradingtracker/telegram',
      description: 'Telegram configuration for Trading Tracker',
      secretStringValue: cdk.SecretValue.unsafePlainText(JSON.stringify({
        botToken: '__SET_ME__',
        webhookSecret: '__SET_ME__',
        allowedChatIds: ['__SET_ME__'],
        targetUserId: '__SET_ME__',
      })),
    });

    const screenshotBucket = new s3.Bucket(this, 'TelegramScreenshotBucket', {
      bucketName: `tradingtracker-prod-telegram-shots-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    const webBucket = new s3.Bucket(this, 'WebHostingBucket', {
      bucketName: `tradingtracker-prod-web-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    const postConfirmationAddTrader = new NodejsFunction(this, 'PostConfirmationAddTraderFunction', {
      functionName: 'tradingtracker-post-confirmation-add-trader',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(repoRoot, 'amplify/functions/postConfirmationAddTrader/handler.ts'),
      timeout: cdk.Duration.seconds(20),
      memorySize: 256,
      environment: {
        DEFAULT_TRADER_GROUP: 'Traders',
      },
      bundling: {
        target: 'node20',
        format: OutputFormat.ESM,
        banner: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
      },
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'tradingtracker-prod-users',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        phone: true,
      },
      autoVerify: {
        email: true,
        phone: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        phoneNumber: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      lambdaTriggers: {
        postConfirmation: postConfirmationAddTrader,
      },
    });

    new cognito.CfnUserPoolGroup(this, 'AdministratorsGroup', {
      groupName: 'Administrators',
      precedence: 0,
      userPoolId: userPool.userPoolId,
    });

    new cognito.CfnUserPoolGroup(this, 'TradersGroup', {
      groupName: 'Traders',
      precedence: 1,
      userPoolId: userPool.userPoolId,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'tradingtracker-web',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: 'tradingtrackerProdIdentityPool',
      allowUnauthenticatedIdentities: true,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    });

    const authenticatedRole = new iam.Role(this, 'AuthenticatedIdentityRole', {
      assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
        StringEquals: {
          'cognito-identity.amazonaws.com:aud': identityPool.ref,
        },
        'ForAnyValue:StringLike': {
          'cognito-identity.amazonaws.com:amr': 'authenticated',
        },
      }, 'sts:AssumeRoleWithWebIdentity'),
    });

    const unauthenticatedRole = new iam.Role(this, 'UnauthenticatedIdentityRole', {
      assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
        StringEquals: {
          'cognito-identity.amazonaws.com:aud': identityPool.ref,
        },
        'ForAnyValue:StringLike': {
          'cognito-identity.amazonaws.com:amr': 'unauthenticated',
        },
      }, 'sts:AssumeRoleWithWebIdentity'),
    });

    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
        unauthenticated: unauthenticatedRole.roleArn,
      },
    });

    const tradingApi = new NodejsFunction(this, 'TradingApiFunction', {
      functionName: 'tradingtracker-trading-api',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(repoRoot, 'amplify/functions/tradingApi/handler.ts'),
      timeout: cdk.Duration.seconds(20),
      memorySize: 512,
      environment: {
        TRADING_TRACKER_TABLE_NAME: table.tableName,
      },
      bundling: {
        target: 'node20',
        format: OutputFormat.ESM,
        banner: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
      },
    });

    const telegramOcr = new lambda.DockerImageFunction(this, 'TelegramOcrFunction', {
      functionName: 'tradingtracker-telegram-ocr',
      code: lambda.DockerImageCode.fromImageAsset(path.join(repoRoot, 'amplify/functions/telegramOcr')),
      architecture: lambda.Architecture.ARM_64,
      memorySize: 2048,
      timeout: cdk.Duration.seconds(120),
      environment: {
        TRADING_TRACKER_TABLE_NAME: table.tableName,
        TELEGRAM_SECRET_NAME: telegramSecret.secretName,
      },
    });

    const telegramWebhook = new NodejsFunction(this, 'TelegramWebhookFunction', {
      functionName: 'tradingtracker-telegram-webhook',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(repoRoot, 'amplify/functions/telegramWebhook/handler.ts'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        TELEGRAM_SCREENSHOT_BUCKET_NAME: screenshotBucket.bucketName,
        TELEGRAM_OCR_FUNCTION_NAME: telegramOcr.functionName,
        TELEGRAM_SECRET_NAME: telegramSecret.secretName,
      },
      bundling: {
        target: 'node20',
        format: OutputFormat.ESM,
        banner: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
      },
    });

    table.grantReadWriteData(tradingApi);
    table.grantWriteData(telegramOcr);
    screenshotBucket.grantReadWrite(telegramWebhook);
    screenshotBucket.grantRead(telegramOcr);
    telegramSecret.grantRead(telegramWebhook);
    telegramSecret.grantRead(telegramOcr);
    telegramOcr.grantInvoke(telegramWebhook);
    postConfirmationAddTrader.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminAddUserToGroup'],
      resources: [`arn:${cdk.Aws.PARTITION}:cognito-idp:${this.region}:${this.account}:userpool/*`],
    }));

    const api = new apigateway.RestApi(this, 'TradingTrackerApi', {
      restApiName: 'TradingTrackerApi',
      defaultCorsPreflightOptions: {
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
      },
      deployOptions: {
        stageName: 'prod',
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ApiCognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });

    const integration = new apigateway.LambdaIntegration(tradingApi, {
      allowTestInvoke: false,
    });
    const telegramWebhookIntegration = new apigateway.LambdaIntegration(telegramWebhook, {
      allowTestInvoke: false,
    });

    const addAuthedMethod = (resource, method) => {
      resource.addMethod(method, integration, {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer,
      });
    };

    const checks = api.root.addResource('checks');
    const checksTrends = checks.addResource('trends');
    const analysis = api.root.addResource('analysis');
    const analysisTrends = analysis.addResource('trends');
    const trades = api.root.addResource('trades');
    const tradesTrends = trades.addResource('trends');
    const confluences = api.root.addResource('confluences');
    const confluencesBase = confluences.addResource('base');
    const telegram = api.root.addResource('telegram');
    const telegramWebhookResource = telegram.addResource('webhook');

    ['POST', 'GET'].forEach((method) => addAuthedMethod(checks, method));
    addAuthedMethod(checksTrends, 'GET');
    ['POST', 'GET', 'DELETE'].forEach((method) => addAuthedMethod(analysis, method));
    addAuthedMethod(analysisTrends, 'GET');
    ['POST', 'GET', 'DELETE'].forEach((method) => addAuthedMethod(trades, method));
    addAuthedMethod(tradesTrends, 'GET');
    ['GET', 'POST', 'DELETE'].forEach((method) => addAuthedMethod(confluences, method));
    ['GET', 'POST', 'DELETE'].forEach((method) => addAuthedMethod(confluencesBase, method));
    telegramWebhookResource.addMethod('POST', telegramWebhookIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'WebOriginAccessIdentity');
    webBucket.grantRead(originAccessIdentity);

    const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(webBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeployWebAssets', {
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ['/*'],
      sources: [s3deploy.Source.asset(path.join(repoRoot, 'dist'))],
      prune: true,
    });

    new cdk.CfnOutput(this, 'Region', { value: this.region });
    new cdk.CfnOutput(this, 'TradingTrackerApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'TelegramWebhookUrl', { value: `${api.url}telegram/webhook` });
    new cdk.CfnOutput(this, 'WebAppUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });
    new cdk.CfnOutput(this, 'TelegramSecretName', { value: telegramSecret.secretName });
    new cdk.CfnOutput(this, 'TelegramScreenshotBucketName', { value: screenshotBucket.bucketName });
    new cdk.CfnOutput(this, 'HostingBucketName', { value: webBucket.bucketName });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
  }
}
