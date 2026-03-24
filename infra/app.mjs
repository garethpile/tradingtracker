import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { TradingTrackerStack } from './trading-tracker-stack.mjs';

const app = new cdk.App();

new TradingTrackerStack(app, 'TradingTrackerAfSouth1Stack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '732439976770',
    region: process.env.CDK_DEFAULT_REGION || 'af-south-1',
  },
  description: 'Trading Tracker infrastructure for af-south-1',
});
