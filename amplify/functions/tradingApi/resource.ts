import { defineFunction } from '@aws-amplify/backend';

export const tradingApi = defineFunction({
  name: 'trading-api',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 20,
});
