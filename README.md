# Trading Tracker

Amplify Gen 2 web app for daily pre-trade checklist capture with:

- Cognito registration/sign-in using email and mobile number
- API Gateway + Lambda backend
- DynamoDB persistence (multiple captures per day supported)
- Session-level market analysis capture (mapped from market-analysis PDF)
- Historical trends and readiness scoring

## Architecture

- Frontend: React + Vite + Amplify UI Authenticator
- Auth: Amplify Auth (Cognito User Pool + Identity Pool)
- Backend:
  - Lambda: `amplify/functions/tradingApi/handler.ts`
  - API Gateway REST routes:
    - `POST /checks` save checklist capture
    - `GET /checks?days=30` list captures for signed-in user
    - `GET /checks/trends?days=30` aggregated trend report
    - `POST /analysis` save market analysis capture
    - `GET /analysis?days=30` list market analyses for signed-in user
    - `GET /analysis/trends?days=30` aggregated market-analysis trend report
  - DynamoDB table (on-demand): deterministic per app/branch (`tradingtracker-<appId>-<branch>-sessions`)

## Amplify Branch/Pipeline Deployment (Gen 2)

This repo is now set up for Amplify branch deployments using `amplify.yml`.

### How it works

- On each branch build, Amplify runs:
  - `npx ampx pipeline-deploy --branch "$AWS_BRANCH" --app-id "$AWS_APP_ID" ...`
- This deploys/updates backend resources for that branch and writes `amplify_outputs.json`.
- Frontend build then runs using those outputs and publishes `dist/`.

### One-time setup in Amplify Console

1. Create Amplify app and connect repository: `garethpile/tradingtracker`.
2. Add branches you want to deploy (for example `main` and `dev`).
3. Confirm build settings use the committed `amplify.yml`.
4. Ensure app is in region `eu-west-1` and uses AWS account `732439976770`.

### Build spec

- File: `amplify.yml`
- Backend deploy: `ampx pipeline-deploy`
- Frontend publish dir: `dist`

### DynamoDB stability strategy

- Table name is now deterministic per Amplify app/branch in `amplify/backend.ts`:
  - `tradingtracker-<appId>-<branch>-sessions`
- This prevents branch collisions and avoids random table replacement on normal updates.
- Table protections enabled:
  - `RemovalPolicy.RETAIN`
  - DynamoDB `deletionProtection: true`

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Start frontend:

```bash
npm run dev
```

3. Build/lint:

```bash
npm run lint
npm run build
```

## Legacy Sandbox Deployment (optional)

If you need manual sandbox deployment from local machine:

```bash
npx ampx sandbox --profile aws-lean-prod-pile-eu-west-1 --identifier prod --once --outputs-format json --outputs-out-dir .
```

## Current deployed sandbox (from local deploy)

- AWS profile: `aws-lean-prod-pile-eu-west-1`
- Region: `eu-west-1`
- Amplify stack: `amplify-tradingtracker-prod-sandbox-be2f050c63`
- API URL: `https://1v69yzz4r5.execute-api.eu-west-1.amazonaws.com/prod/`
- Cognito User Pool: `eu-west-1_qy9cFgzMy`

## Notes

- The checklist form mirrors the provided PDF structure, including duplicated emotional-readiness prompts and commitment checkboxes.
- Each capture computes a readiness score (0-100) from checklist booleans.
- Trend bars and summary cards are aggregated in Lambda and rendered in the frontend dashboard.
