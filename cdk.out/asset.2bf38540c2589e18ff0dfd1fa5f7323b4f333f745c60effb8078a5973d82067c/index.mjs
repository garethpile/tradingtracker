import { createRequire } from "module"; const require = createRequire(import.meta.url);

// amplify/functions/postConfirmationAddTrader/handler.ts
import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient
} from "@aws-sdk/client-cognito-identity-provider";
var client = new CognitoIdentityProviderClient({});
var traderGroupName = process.env.DEFAULT_TRADER_GROUP ?? "Traders";
var handler = async (event) => {
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
        GroupName: traderGroupName
      })
    );
  } catch (error) {
    console.error("Failed to add user to Traders group", {
      userPoolId,
      username,
      traderGroupName,
      error
    });
  }
  return event;
};
export {
  handler
};
