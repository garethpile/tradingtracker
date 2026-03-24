import { defineFunction } from '@aws-amplify/backend';

export const telegramWebhook = defineFunction({
  name: 'telegram-webhook',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 30,
  memoryMB: 512,
});
