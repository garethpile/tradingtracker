import { defineBackend, secret } from '@aws-amplify/backend';
import { CDKContextKey } from '@aws-amplify/platform-core';
import { Duration, RemovalPolicy, Stack, Tags } from 'aws-cdk-lib';
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  LambdaIntegration,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Bucket, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { auth } from './auth/resource';
import { postConfirmationAddTrader } from './functions/postConfirmationAddTrader/resource';
import { telegramOcr } from './functions/telegramOcr/resource';
import { telegramWebhook } from './functions/telegramWebhook/resource';
import { tradingApi } from './functions/tradingApi/resource';

const backend = defineBackend({
  auth,
  tradingApi,
  postConfirmationAddTrader,
  telegramWebhook,
  telegramOcr,
});

const apiStack = backend.tradingApi.stack;
const authStack = backend.auth.stack;

const sanitizeNamePart = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const backendNamespace = String(apiStack.node.getContext(CDKContextKey.BACKEND_NAMESPACE) ?? '');
const backendName = String(apiStack.node.getContext(CDKContextKey.BACKEND_NAME) ?? '');
const deploymentType = String(apiStack.node.getContext(CDKContextKey.DEPLOYMENT_TYPE) ?? 'sandbox');

const namespacePart = sanitizeNamePart(backendNamespace).slice(0, 12) || 'local';
const backendNamePart = sanitizeNamePart(backendName).slice(0, 30) || 'sandbox';
const tableName = deploymentType === 'branch'
  ? `tradingtracker-${namespacePart}-${backendNamePart}-sessions`
  : `tradingtracker-${backendNamePart}-sessions`;
const deploymentEnv = backendNamePart;

const commonTags: Record<string, string> = {
  Project: 'TradingTracker',
  Application: 'TradingTrackerWeb',
  Environment: deploymentEnv,
  ManagedBy: 'AmplifyGen2',
  CostCenter: 'Trading',
  Owner: 'Pile',
  Repository: 'garethpile/tradingtracker',
};

for (const [key, value] of Object.entries(commonTags)) {
  Tags.of(apiStack).add(key, value);
  Tags.of(authStack).add(key, value);
}

const checklistTable = new Table(apiStack, 'TradingChecklistTable', {
  tableName,
  partitionKey: {
    name: 'userId',
    type: AttributeType.STRING,
  },
  sortKey: {
    name: 'createdAt',
    type: AttributeType.STRING,
  },
  billingMode: BillingMode.PAY_PER_REQUEST,
  deletionProtection: true,
  pointInTimeRecoverySpecification: {
    pointInTimeRecoveryEnabled: true,
  },
  removalPolicy: RemovalPolicy.RETAIN,
});

const telegramScreenshotBucket = new Bucket(apiStack, 'TelegramScreenshotBucket', {
  bucketName: `${tableName}-telegram-shots`,
  removalPolicy: RemovalPolicy.RETAIN,
  autoDeleteObjects: false,
  cors: [
    {
      allowedMethods: [HttpMethods.GET],
      allowedOrigins: ['*'],
      allowedHeaders: ['*'],
    },
  ],
});

backend.tradingApi.addEnvironment(
  'TRADING_TRACKER_TABLE_NAME',
  checklistTable.tableName,
);
backend.postConfirmationAddTrader.addEnvironment(
  'DEFAULT_TRADER_GROUP',
  'Traders',
);
backend.telegramWebhook.addEnvironment(
  'TELEGRAM_SCREENSHOT_BUCKET_NAME',
  telegramScreenshotBucket.bucketName,
);
backend.telegramWebhook.addEnvironment(
  'TELEGRAM_OCR_FUNCTION_NAME',
  backend.telegramOcr.resources.lambda.functionName,
);
backend.telegramWebhook.addEnvironment(
  'TELEGRAM_BOT_TOKEN',
  secret('TELEGRAM_BOT_TOKEN'),
);
backend.telegramWebhook.addEnvironment(
  'TELEGRAM_WEBHOOK_SECRET',
  secret('TELEGRAM_WEBHOOK_SECRET'),
);
backend.telegramWebhook.addEnvironment(
  'TELEGRAM_ALLOWED_CHAT_IDS',
  secret('TELEGRAM_ALLOWED_CHAT_IDS'),
);
backend.telegramWebhook.addEnvironment(
  'TELEGRAM_TARGET_USER_ID',
  secret('TELEGRAM_TARGET_USER_ID'),
);
backend.telegramOcr.addEnvironment(
  'TRADING_TRACKER_TABLE_NAME',
  checklistTable.tableName,
);
backend.telegramOcr.addEnvironment(
  'TELEGRAM_BOT_TOKEN',
  secret('TELEGRAM_BOT_TOKEN'),
);

backend.tradingApi.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:DeleteItem', 'dynamodb:UpdateItem'],
    resources: [checklistTable.tableArn],
  }),
);
backend.telegramOcr.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:PutItem'],
    resources: [checklistTable.tableArn],
  }),
);
backend.telegramWebhook.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['lambda:InvokeFunction'],
    resources: [backend.telegramOcr.resources.lambda.functionArn],
  }),
);
telegramScreenshotBucket.grantReadWrite(backend.telegramWebhook.resources.lambda);
telegramScreenshotBucket.grantRead(backend.telegramOcr.resources.lambda);

const api = new RestApi(apiStack, 'TradingTrackerApi', {
  restApiName: 'TradingTrackerApi',
  defaultCorsPreflightOptions: {
    allowHeaders: Cors.DEFAULT_HEADERS,
    allowMethods: Cors.ALL_METHODS,
    allowOrigins: Cors.ALL_ORIGINS,
  },
});

const authorizer = new CognitoUserPoolsAuthorizer(apiStack, 'ApiCognitoAuthorizer', {
  cognitoUserPools: [backend.auth.resources.userPool],
});

const checks = api.root.addResource('checks');
const checksTrends = checks.addResource('trends');
const analysis = api.root.addResource('analysis');
const analysisTrends = analysis.addResource('trends');
const trades = api.root.addResource('trades');
const tradesTrends = trades.addResource('trends');
const telegram = api.root.addResource('telegram');
const telegramWebhookResource = telegram.addResource('webhook');
const confluences = api.root.addResource('confluences');
const confluencesBase = confluences.addResource('base');
const integration = new LambdaIntegration(backend.tradingApi.resources.lambda, {
  allowTestInvoke: false,
});
const telegramWebhookIntegration = new LambdaIntegration(backend.telegramWebhook.resources.lambda, {
  allowTestInvoke: false,
});

checks.addMethod('POST', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

checks.addMethod('GET', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

checksTrends.addMethod('GET', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

analysis.addMethod('POST', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

analysis.addMethod('GET', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

analysis.addMethod('DELETE', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

analysisTrends.addMethod('GET', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

trades.addMethod('POST', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

trades.addMethod('GET', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

trades.addMethod('DELETE', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

tradesTrends.addMethod('GET', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

telegramWebhookResource.addMethod('POST', telegramWebhookIntegration, {
  authorizationType: AuthorizationType.NONE,
});

confluences.addMethod('GET', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

confluences.addMethod('POST', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

confluences.addMethod('DELETE', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

confluencesBase.addMethod('GET', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

confluencesBase.addMethod('POST', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

confluencesBase.addMethod('DELETE', integration, {
  authorizationType: AuthorizationType.COGNITO,
  authorizer,
});

backend.addOutput({
  custom: {
    region: Stack.of(api).region,
    tradingTrackerApiUrl: api.url,
    telegramWebhookUrl: `${api.url}telegram/webhook`,
    telegramScreenshotBucketName: telegramScreenshotBucket.bucketName,
  },
});
