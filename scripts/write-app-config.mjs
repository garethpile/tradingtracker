import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stackName = process.env.STACK_NAME || 'TradingTrackerAfSouth1Stack';
const profile = process.env.AWS_PROFILE;
const region = process.env.AWS_REGION || 'af-south-1';

const awsArgs = [
  'cloudformation',
  'describe-stacks',
  '--stack-name', stackName,
  '--region', region,
  '--query', 'Stacks[0].Outputs',
  '--output', 'json',
];

if (profile) {
  awsArgs.splice(4, 0, '--profile', profile);
}

const { stdout } = await execFileAsync('aws', awsArgs, {
  cwd: repoRoot,
});

const outputs = JSON.parse(stdout);
const map = Object.fromEntries(outputs.map((item) => [item.OutputKey, item.OutputValue]));

const config = {
  auth: {
    user_pool_id: map.UserPoolId || '',
    aws_region: map.Region || region,
    user_pool_client_id: map.UserPoolClientId || '',
    identity_pool_id: map.IdentityPoolId || '',
    mfa_methods: [],
    standard_required_attributes: ['email', 'phone_number'],
    username_attributes: ['email', 'phone_number'],
    user_verification_types: ['email', 'phone_number'],
    groups: [
      { Administrators: { precedence: 0 } },
      { Traders: { precedence: 1 } },
    ],
    mfa_configuration: 'NONE',
    password_policy: {
      min_length: 8,
      require_lowercase: true,
      require_numbers: true,
      require_symbols: true,
      require_uppercase: true,
    },
    unauthenticated_identities_enabled: true,
  },
  version: '1.4',
  custom: {
    region: map.Region || region,
    tradingTrackerApiUrl: map.TradingTrackerApiUrl || '',
    telegramWebhookUrl: map.TelegramWebhookUrl || '',
    webAppUrl: map.WebAppUrl || '',
  },
};

await fs.writeFile(
  path.join(repoRoot, 'app-config.json'),
  `${JSON.stringify(config, null, 2)}\n`,
  'utf8',
);

console.log(`Wrote app-config.json from stack ${stackName} in ${region}`);
