# TradingTracker Architecture

## Document Update History

| Date | Update | Author |
| --- | --- | --- |
| 2026-03-23 | Created the current-state architecture document for the active TradingTracker solution. | Codex |
| 2026-03-23 | Recorded the confirmed `af-south-1` production deployment footprint and noted the retired `eu-west-1` TradingTracker environment. | Codex |

## DEPLOYMENTS

This section lists the currently identifiable deployment locations so users can quickly check the live environment footprint.

| Environment | Friendly URL | CloudFront URL | Current Repo Evidence |
| --- | --- | --- | --- |
| Dev | Not currently defined in the active repo configuration. | Not currently defined in the active repo configuration. | No active `dev` hostname, dedicated CDK stack, or committed environment mapping was found. |
| Test | Not currently defined in the active repo configuration. | Not currently defined in the active repo configuration. | No active `test` hostname, dedicated CDK stack, or committed environment mapping was found. |
| Prod | Not currently defined as a custom domain in the active repo configuration. | `https://d3t1f0id7cxdfront.net` | The active CDK stack outputs and checked-in `app-config.json` point to `af-south-1` CloudFront, API Gateway, Cognito User Pool, and Identity Pool resources. |

Active stack names to check in AWS CloudFormation for the current production environment:

- `TradingTrackerAfSouth1Stack`

Retired environment note:

- The older `eu-west-1` TradingTracker Amplify root stacks and Cognito user pools were removed on 2026-03-23 and are not part of the active runtime footprint anymore.

## Purpose

This document describes the current-state architecture of TradingTracker.

TradingTracker is a trading journal and review platform where:

- a user signs in with Cognito using email and mobile number
- the user captures daily readiness checklist entries
- the user records market analysis for a trading date
- the user logs trade sets, confluences, screenshots, and commentary
- trend views aggregate checklist, analysis, and trade history over time
- Telegram can submit screenshots into the system for OCR-assisted trade logging

This is an as-is architecture document. It describes the system as it currently stands and the active boundaries it is built around.

## Current Scope

The active platform covers:

- Cognito user registration and sign-in
- automatic assignment of confirmed users into the `Traders` group
- checklist capture and scoring
- market analysis capture and historical trend aggregation
- trade log capture with support for multiple entries and take-profit legs
- personal and shared confluence management
- screenshot-assisted trade review
- Telegram webhook ingestion and OCR-backed trade extraction
- authenticated single-page web experience served through CloudFront

## Current Constraints

- The active production region is `af-south-1`.
- The primary deployed runtime is the CDK-managed stack, not Amplify Hosting.
- The active production frontend uses `app-config.json` generated from the `af-south-1` stack outputs.
- API routes for checklist, analysis, trade, and confluence data are protected by Cognito authorizers.
- Telegram webhook ingestion is public by design, but downstream processing is internal.
- DynamoDB data in the active production stack is retained and protected against accidental deletion.
- No custom production domain is currently defined in the active repo configuration.

## Current Runtime Architecture

### Frontend: CloudFront + S3

The web client is a React + Vite single-page application.

Responsibilities:

- Cognito-based sign-up, confirmation, sign-in, and sign-out
- checklist capture UI and readiness score preview
- market analysis capture UI
- trade log management UI
- confluence management UI
- trend and history views across checklist, analysis, and trade datasets

The static site is deployed to S3 and served through CloudFront from the `TradingTrackerAfSouth1Stack`.

### Auth Boundary: Cognito User Pool + Identity Pool

This boundary owns user identity and session issuance.

Responsibilities:

- self-sign-up with email and phone number
- user confirmation and token issuance
- authenticated and unauthenticated identity roles
- `Administrators` and `Traders` Cognito groups
- post-confirmation trigger that adds newly confirmed users to `Traders`

Current production auth identifiers:

- User Pool: `af-south-1_7GSY4qNVK`
- User Pool Client: `5lr2rcf7d2hoofa4g3ou7apra2`
- Identity Pool: `af-south-1:e56cbc77-d403-412a-88a4-98d9bfd8562c`

### Application API Boundary: API Gateway + Trading API Lambda

This boundary owns the main authenticated application workflow.

Responsibilities:

- checklist create and query operations
- checklist trend aggregation
- market analysis create, list, delete, and trend aggregation
- trade create, list, delete, and trade trend aggregation
- confluence create, list, delete, and base confluence administration
- authorization checks based on Cognito identity and group claims

Current production API endpoint:

- `https://agdobtxv8d.execute-api.af-south-1.amazonaws.com/prod/`

### Data Boundary: DynamoDB

This boundary is the main system of record for application entries.

Responsibilities:

- persist checklist captures
- persist market analysis captures
- persist trade logs and related extracted screenshot details
- persist confluence records
- query per-user and per-date history for dashboard rendering

Current production table:

- `tradingtracker-prod-sessions`

### Telegram OCR Boundary

This boundary handles Telegram-originated screenshot ingestion.

Responsibilities:

- receive Telegram webhook calls
- validate the configured Telegram secret path and allowed sender constraints
- download Telegram screenshots and store them in S3
- invoke the OCR worker asynchronously
- extract screenshot text with Tesseract
- write OCR-derived trade data into DynamoDB
- optionally reply back through Telegram with processing results

Runtime components:

- `tradingtracker-telegram-webhook`
- `tradingtracker-telegram-ocr`
- S3 bucket `tradingtracker-prod-telegram-shots-732439976770-af-south-1`
- Secrets Manager secret `tradingtracker/telegram`

## Current API Areas

### Authenticated Checklist Flow

- `POST /checks`
- `GET /checks`
- `GET /checks/trends`

### Authenticated Market Analysis Flow

- `POST /analysis`
- `GET /analysis`
- `DELETE /analysis`
- `GET /analysis/trends`

### Authenticated Trade Flow

- `POST /trades`
- `GET /trades`
- `DELETE /trades`
- `GET /trades/trends`

### Authenticated Confluence Flow

- `GET /confluences`
- `POST /confluences`
- `DELETE /confluences`
- `GET /confluences/base`
- `POST /confluences/base`
- `DELETE /confluences/base`

### Public System-to-System Flow

- `POST /telegram/webhook`

## Canonical Runtime Flow

1. A user opens the CloudFront-hosted web app.
2. The frontend loads Cognito and API configuration from `app-config.json`.
3. The user signs up or signs in through Cognito.
4. On first successful confirmation, the post-confirmation Lambda adds the user to the `Traders` group.
5. The frontend receives Cognito tokens and uses them on authenticated API Gateway requests.
6. The trading API Lambda validates identity through API Gateway Cognito authorizers.
7. Checklist, analysis, trade, and confluence operations are written to or read from DynamoDB.
8. Trend endpoints aggregate historical records for dashboard views.
9. If a Telegram screenshot is submitted, the public webhook stores the image, invokes OCR, and writes extracted trade data into DynamoDB.
10. The frontend refreshes and renders the updated history and trends for the signed-in user.

## Current Data Domains

The active system centers around these persisted data areas:

- checklist captures
- checklist trend aggregates
- market analysis captures
- trade logs
- screenshot extraction details
- confluence definitions
- user-scoped history queries

## Current Deployment Paths

### Active Production Path

- CDK app entry: `infra/app.mjs`
- main production stack: `TradingTrackerAfSouth1Stack`
- web asset deployment: S3 bucket deployment with CloudFront invalidation
- config generation: `scripts/write-app-config.mjs`

### Secondary Repo Path

The repo still contains an Amplify Gen 2 backend definition under `amplify/`, including:

- `amplify/auth/resource.ts`
- `amplify/backend.ts`
- `amplify/functions/*`

This path remains useful as backend infrastructure definition and branch-deploy support logic, but the currently confirmed production runtime is the CDK-managed `af-south-1` stack.

## Current Reusable Assets

### Active And Reused

- React frontend in `src/`
- Cognito post-confirmation group assignment handler in `amplify/functions/postConfirmationAddTrader/handler.ts`
- trading API Lambda in `amplify/functions/tradingApi/handler.ts`
- Telegram webhook and OCR handlers in `amplify/functions/telegramWebhook` and `amplify/functions/telegramOcr`
- CDK production infrastructure in `infra/`

### Operationally Important

- `app-config.json`
- `amplify_outputs.json` as generated environment output, not source of truth
- `amplify.yml`
- `scripts/write-app-config.mjs`

### Legacy Reference Only

- deleted `eu-west-1` TradingTracker Amplify root stacks
- deleted `eu-west-1` TradingTracker Cognito user pools
- historical `eu-west-1` deployment notes retained only as documentation context
