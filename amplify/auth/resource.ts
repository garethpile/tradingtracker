import { defineAuth } from '@aws-amplify/backend';
import { postConfirmationAddTrader } from '../functions/postConfirmationAddTrader/resource';

export const auth = defineAuth({
  loginWith: {
    email: true,
    phone: true,
  },
  userAttributes: {
    email: {
      required: true,
      mutable: true,
    },
    phoneNumber: {
      required: true,
      mutable: true,
    },
  },
  groups: ['Administrators', 'Traders'],
  triggers: {
    postConfirmation: postConfirmationAddTrader,
  },
  access: (allow) => [
    allow.resource(postConfirmationAddTrader).to(['addUserToGroup']),
  ],
});
