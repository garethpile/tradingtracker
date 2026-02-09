import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.TRADING_TRACKER_TABLE_NAME;

type ChecklistPayload = {
  tradingDate: string;
  sessionName?: string;
  environmentReady: boolean;
  mentallyReady: boolean;
  emotionallyReadyPrimary: boolean;
  emotionallyReadySecondary: boolean;
  commitsRules: boolean;
  commitsStopLimit: boolean;
  commitsRiskSizing: boolean;
  commitsConfirmationOnly: boolean;
  signature: string;
  notes?: string;
};

const json = (statusCode: number, payload: unknown): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const getUserSub = (event: APIGatewayProxyEvent): string | undefined => {
  const claims = event.requestContext.authorizer?.claims;
  if (!claims) {
    return undefined;
  }

  return claims.sub;
};

const scoreEntry = (item: ChecklistPayload): number => {
  const checks = [
    item.environmentReady,
    item.mentallyReady,
    item.emotionallyReadyPrimary,
    item.emotionallyReadySecondary,
    item.commitsRules,
    item.commitsStopLimit,
    item.commitsRiskSizing,
    item.commitsConfirmationOnly,
  ];

  const points = checks.filter(Boolean).length;
  return Number(((points / checks.length) * 100).toFixed(1));
};

const parseQueryDays = (daysParam?: string): number => {
  if (!daysParam) {
    return 30;
  }

  const parsed = Number.parseInt(daysParam, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 365) {
    return 30;
  }

  return parsed;
};

const getStartIsoForDays = (days: number): string => {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  now.setUTCDate(now.getUTCDate() - (days - 1));
  return now.toISOString();
};

const buildTrendReport = (items: Array<Record<string, unknown>>) => {
  if (items.length === 0) {
    return {
      totalCaptures: 0,
      averageScore: 0,
      readinessRates: {},
      dailyScores: [],
    };
  }

  const booleanKeys = [
    'environmentReady',
    'mentallyReady',
    'emotionallyReadyPrimary',
    'emotionallyReadySecondary',
    'commitsRules',
    'commitsStopLimit',
    'commitsRiskSizing',
    'commitsConfirmationOnly',
  ] as const;

  const counts: Record<string, number> = {};
  for (const key of booleanKeys) {
    counts[key] = 0;
  }

  let totalScore = 0;
  const byDate = new Map<string, Array<number>>();

  for (const item of items) {
    for (const key of booleanKeys) {
      if (item[key] === true) {
        counts[key] += 1;
      }
    }

    const score = Number(item.score ?? 0);
    totalScore += score;

    const tradingDate = String(item.tradingDate ?? '');
    if (!byDate.has(tradingDate)) {
      byDate.set(tradingDate, []);
    }
    byDate.get(tradingDate)?.push(score);
  }

  const readinessRates = Object.fromEntries(
    booleanKeys.map((key) => [
      key,
      Number(((counts[key] / items.length) * 100).toFixed(1)),
    ]),
  );

  const dailyScores = Array.from(byDate.entries())
    .map(([date, scores]) => ({
      date,
      averageScore: Number((scores.reduce((acc, v) => acc + v, 0) / scores.length).toFixed(1)),
      captures: scores.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalCaptures: items.length,
    averageScore: Number((totalScore / items.length).toFixed(1)),
    readinessRates,
    dailyScores,
  };
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  if (!tableName) {
    return json(500, { message: 'Missing table configuration' });
  }

  const userSub = getUserSub(event);
  if (!userSub) {
    return json(401, { message: 'Unauthorized' });
  }

  const routeKey = `${event.httpMethod} ${event.path}`;

  if (routeKey.endsWith('POST /checks')) {
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as ChecklistPayload;
    const createdAt = new Date().toISOString();
    const id = crypto.randomUUID();

    const item = {
      userId: userSub,
      createdAt,
      id,
      ...payload,
      score: scoreEntry(payload),
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    return json(201, item);
  }

  if (routeKey.endsWith('GET /checks')) {
    const days = parseQueryDays(event.queryStringParameters?.days);
    const startIso = getStartIsoForDays(days);

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
        ExpressionAttributeValues: {
          ':userId': userSub,
          ':startIso': startIso,
        },
        ScanIndexForward: false,
      }),
    );

    return json(200, {
      items: result.Items ?? [],
    });
  }

  if (routeKey.endsWith('GET /checks/trends')) {
    const days = parseQueryDays(event.queryStringParameters?.days);
    const startIso = getStartIsoForDays(days);

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
        ExpressionAttributeValues: {
          ':userId': userSub,
          ':startIso': startIso,
        },
      }),
    );

    return json(200, {
      days,
      ...buildTrendReport(result.Items ?? []),
    });
  }

  return json(404, { message: 'Route not found' });
};
