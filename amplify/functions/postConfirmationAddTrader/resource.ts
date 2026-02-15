import { defineFunction } from '@aws-amplify/backend';

export const postConfirmationAddTrader = defineFunction({
  name: 'post-confirmation-add-trader',
  entry: './handler.ts',
  resourceGroupName: 'auth',
  runtime: 20,
  timeoutSeconds: 20,
});
