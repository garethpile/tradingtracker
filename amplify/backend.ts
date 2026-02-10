import { defineBackend } from '@aws-amplify/backend';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  LambdaIntegration,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { tradingApi } from './functions/tradingApi/resource';

const backend = defineBackend({
  auth,
  tradingApi,
});

const apiStack = backend.tradingApi.stack;

const checklistTable = new Table(apiStack, 'TradingChecklistTable', {
  partitionKey: {
    name: 'userId',
    type: AttributeType.STRING,
  },
  sortKey: {
    name: 'createdAt',
    type: AttributeType.STRING,
  },
  billingMode: BillingMode.PAY_PER_REQUEST,
  pointInTimeRecoverySpecification: {
    pointInTimeRecoveryEnabled: true,
  },
  removalPolicy: RemovalPolicy.RETAIN,
});

backend.tradingApi.resources.lambda.addEnvironment(
  'TRADING_TRACKER_TABLE_NAME',
  checklistTable.tableName,
);

backend.tradingApi.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:PutItem', 'dynamodb:Query'],
    resources: [checklistTable.tableArn],
  }),
);

backend.tradingApi.resources.lambda.timeout = Duration.seconds(20);

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
const integration = new LambdaIntegration(backend.tradingApi.resources.lambda);

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

backend.addOutput({
  custom: {
    region: Stack.of(api).region,
    tradingTrackerApiUrl: api.url,
  },
});
