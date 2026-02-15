import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({});
const traderGroupName = process.env.DEFAULT_TRADER_GROUP ?? 'Traders';

export const handler: PostConfirmationTriggerHandler = async (event) => {
  const userPoolId = event.userPoolId;
  const username = event.userName;

  if (!userPoolId || !username) {
    return event;
  }

  try {
    await client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: traderGroupName,
      }),
    );
  } catch (error) {
    console.error('Failed to add user to Traders group', {
      userPoolId,
      username,
      traderGroupName,
      error,
    });
  }

  return event;
};
