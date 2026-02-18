import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
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

type AnalysisDirection = 'bullish' | 'bearish' | 'consolidation' | 'none';
type MarketStructureBias = 'buy' | 'sell' | 'none';
type Impact = 'high' | 'low';

type MarketAnalysisPayload = {
  dayId?: string;
  analysisTime?: string;
  pair: string;
  tradingDate: string;
  sessionName: string;
  fundamentalsSentiment: AnalysisDirection;
  movingAverages5m: AnalysisDirection;
  patternsTrend5m: AnalysisDirection;
  movingAverages1h: AnalysisDirection;
  patternsTrend1h: AnalysisDirection;
  relativeStrength5m: AnalysisDirection;
  relativeStrength1h: AnalysisDirection;
  candle1h: AnalysisDirection;
  candle4h: AnalysisDirection;
  candleDaily: AnalysisDirection;
  candleWeekly: AnalysisDirection;
  candleMonthly: AnalysisDirection;
  conclusion: 'bullish' | 'bearish' | 'consolidation' | 'bearishConsolidation' | 'bullishConsolidation';
  prevDayLow?: string;
  prevDayHigh?: string;
  currentDayLow?: string;
  currentDayHigh?: string;
  futuresPrice?: string;
  priceActionNotes?: string;
  redFolderNews: boolean;
  newsImpact: Impact;
  newsTime?: string;
  newsNotes?: string;
  sellRsiLevel?: string;
  buyRsiLevel?: string;
  hasClearTrend: boolean;
  currentTrend: AnalysisDirection;
  directionalBias: 'bullish' | 'bearish' | 'none';
  tradingStyle: 'trend' | 'consolidation';
  tradingNotes?: string;
  sellZone1?: string;
  sellZone2?: string;
  sellZone3?: string;
  buyZone1?: string;
  buyZone2?: string;
  buyZone3?: string;
  reversalZone1?: string;
  reversalZone2?: string;
  swingZone1?: string;
  swingZone2?: string;
  marketStructure: Array<{
    rangeName: string;
    bias: MarketStructureBias;
    level?: string;
  }>;
};

type TradeLogPayload = {
  tradeDate: string;
  tradeTime?: string;
  sessionName?: string;
  tradingAsset: string;
  strategy: string;
  confluences?: string[];
  entryPrice?: number;
  riskRewardRatio?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  estimatedLoss?: number;
  estimatedProfit?: number;
  exitPrice?: number;
  totalProfit?: number;
  feelings?: 'Satisfied' | 'Neutral' | 'Disappointed' | 'Not filled';
  comments?: string;
  chartLink?: string;
};

type TradingDayPayload = {
  tradingDate: string;
  title?: string;
  notes?: string;
};

type TradingSessionPayload = {
  dayId: string;
  name: string;
  analysisTime?: string;
  tradingAsset: string;
  strategy?: string;
  directionalBias?: 'bullish' | 'bearish' | 'consolidation' | 'none';
  confluences?: string[];
  notes?: string;
};

type SessionTradePayload = {
  dayId: string;
  sessionId?: string;
  tradeDate: string;
  tradeTime?: string;
  tradingAsset: string;
  strategy: string;
  confluences?: string[];
  entryPrice?: number;
  riskRewardRatio?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  estimatedLoss?: number;
  estimatedProfit?: number;
  exitPrice?: number;
  totalProfit?: number;
  feelings?: 'Satisfied' | 'Neutral' | 'Disappointed' | 'Not filled';
  comments?: string;
  chartLink?: string;
};

type ConfluencePayload = {
  name: string;
};

const baseConfluenceFallback = [
  'Higher timeframe bias alignmnet',
  'Break & retest',
  'Rejection at high',
  'Moving average - Bullish - Price above 21 & 50 SMA',
  'Moving average - Bullish - 21 crossing above 50',
  'RSI - Above 55',
  'RSI - Below 45',
  'MACD - Histogram expanding in dorection of trade',
];
const baseConfluenceUserId = '__BASE_CONFLUENCES__';

const json = (statusCode: number, payload: unknown): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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

const getUserGroups = (event: APIGatewayProxyEvent): string[] => {
  const claims = event.requestContext.authorizer?.claims;
  if (!claims) {
    return [];
  }

  const rawGroups = claims['cognito:groups'];
  if (!rawGroups) {
    return [];
  }

  if (Array.isArray(rawGroups)) {
    return rawGroups.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }

  if (typeof rawGroups === 'string') {
    const trimmed = rawGroups.trim();
    if (trimmed.length === 0) {
      return [];
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter((item) => item.length > 0);
        }
      } catch {
        return [];
      }
    }

    return trimmed.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
  }

  return [];
};

const isAdministrator = (event: APIGatewayProxyEvent): boolean =>
  getUserGroups(event).includes('Administrators');

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

const scoreAnalysis = (item: MarketAnalysisPayload): number => {
  const sentimentFields: AnalysisDirection[] = [
    item.fundamentalsSentiment,
    item.movingAverages5m,
    item.patternsTrend5m,
    item.movingAverages1h,
    item.patternsTrend1h,
    item.relativeStrength5m,
    item.relativeStrength1h,
    item.candle1h,
    item.candle4h,
    item.candleDaily,
    item.candleWeekly,
    item.candleMonthly,
    item.currentTrend,
  ];

  const filledDirectional = sentimentFields.filter((field) => field !== 'none').length;
  const keyFields = [
    item.pair,
    item.tradingDate,
    item.sessionName,
    item.conclusion,
    item.newsTime ?? '',
    item.sellRsiLevel ?? '',
    item.buyRsiLevel ?? '',
  ];
  const filledCore = keyFields.filter((field) => field.trim().length > 0).length;
  const zoneFields = [
    item.sellZone1,
    item.sellZone2,
    item.sellZone3,
    item.buyZone1,
    item.buyZone2,
    item.buyZone3,
    item.reversalZone1,
    item.reversalZone2,
    item.swingZone1,
    item.swingZone2,
  ];
  const filledZones = zoneFields.filter((field) => (field ?? '').trim().length > 0).length;

  const marketStructureSet = item.marketStructure.filter(
    (row) => row.bias !== 'none' || (row.level ?? '').trim().length > 0,
  ).length;

  const weightedScore =
    (filledDirectional / sentimentFields.length) * 40
    + (filledCore / keyFields.length) * 20
    + (filledZones / zoneFields.length) * 20
    + (marketStructureSet / Math.max(item.marketStructure.length, 1)) * 20;

  return Number(weightedScore.toFixed(1));
};

const scoreTradeLog = (item: TradeLogPayload): number => {
  const step1 = [
    item.tradeDate,
    item.tradeTime,
    item.tradingAsset,
    item.strategy,
    item.confluences && item.confluences.length > 0 ? item.confluences.join(',') : undefined,
    item.entryPrice,
    item.riskRewardRatio,
    item.stopLossPrice,
    item.takeProfitPrice,
    item.estimatedLoss,
    item.estimatedProfit,
  ];

  const step2 = [
    item.exitPrice,
    item.totalProfit,
    item.feelings,
    item.comments,
    item.chartLink,
  ];

  const step1Done = step1.filter((value) => value !== undefined && value !== '').length;
  const step2Done = step2.filter((value) => value !== undefined && value !== '').length;

  const weighted = (step1Done / step1.length) * 60 + (step2Done / step2.length) * 40;
  return Number(weighted.toFixed(1));
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

const getAllUserItems = async (userId: string): Promise<Array<Record<string, unknown>>> => {
  const result = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':startIso': '0000-01-01T00:00:00.000Z',
      },
    }),
  );

  return (result.Items ?? []) as Array<Record<string, unknown>>;
};

const getWeekEndingSunday = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = date.getUTCDay();
  const diff = (7 - day) % 7;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
};

const normalizeConfluenceName = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

const getOrSeedBaseConfluenceItems = async (): Promise<Array<Record<string, unknown>>> => {
  const baseQuery = async () => client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
      FilterExpression: 'itemType = :baseConfluenceItemType',
      ExpressionAttributeValues: {
        ':userId': baseConfluenceUserId,
        ':startIso': '0000-01-01T00:00:00.000Z',
        ':baseConfluenceItemType': 'BASE_CONFLUENCE',
      },
      ScanIndexForward: false,
    }),
  );

  const firstResult = await baseQuery();
  if ((firstResult.Items ?? []).length > 0) {
    return firstResult.Items ?? [];
  }

  await Promise.all(
    baseConfluenceFallback.map(async (name, index) => {
      const createdAt = `BASE#${String(index + 1).padStart(3, '0')}`;
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              userId: baseConfluenceUserId,
              createdAt,
              id: `base-${index + 1}`,
              itemType: 'BASE_CONFLUENCE',
              name,
            },
            ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(createdAt)',
          }),
        );
      } catch {
        // Ignore seed race collisions.
      }
    }),
  );

  const secondResult = await baseQuery();
  return secondResult.Items ?? [];
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const tradeDirectionIsBuy = (entryPrice?: number, takeProfitPrice?: number): boolean => {
  if (entryPrice === undefined || takeProfitPrice === undefined) {
    return true;
  }

  return takeProfitPrice >= entryPrice;
};

const calculateTradeDerivedValues = (payload: TradeLogPayload) => {
  const entry = payload.entryPrice;
  const stop = payload.stopLossPrice;
  const take = payload.takeProfitPrice;
  const exit = payload.exitPrice;

  const estimatedLoss = entry !== undefined && stop !== undefined
    ? Number(Math.abs(entry - stop).toFixed(2))
    : undefined;
  const estimatedProfit = entry !== undefined && take !== undefined
    ? Number(Math.abs(take - entry).toFixed(2))
    : undefined;

  const tradeProfit = entry !== undefined && exit !== undefined
    ? Number((tradeDirectionIsBuy(entry, take) ? exit - entry : entry - exit).toFixed(2))
    : payload.totalProfit;

  return { estimatedLoss, estimatedProfit, tradeProfit };
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

const buildAnalysisTrendReport = (items: Array<Record<string, unknown>>) => {
  if (items.length === 0) {
    return {
      totalAnalyses: 0,
      averageCompletionScore: 0,
      conclusionMix: {},
      directionalBiasMix: {},
      dailyCompletion: [],
    };
  }

  let totalScore = 0;
  const conclusionCounts: Record<string, number> = {};
  const biasCounts: Record<string, number> = {};
  const byDate = new Map<string, Array<number>>();

  for (const item of items) {
    const score = Number(item.analysisScore ?? 0);
    totalScore += score;

    const conclusion = String(item.conclusion ?? 'unknown');
    conclusionCounts[conclusion] = (conclusionCounts[conclusion] ?? 0) + 1;

    const bias = String(item.directionalBias ?? 'unknown');
    biasCounts[bias] = (biasCounts[bias] ?? 0) + 1;

    const tradingDate = String(item.tradingDate ?? '');
    if (!byDate.has(tradingDate)) {
      byDate.set(tradingDate, []);
    }
    byDate.get(tradingDate)?.push(score);
  }

  const normalize = (source: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(source).map(([key, value]) => [
        key,
        Number(((value / items.length) * 100).toFixed(1)),
      ]),
    );

  const dailyCompletion = Array.from(byDate.entries())
    .map(([date, scores]) => ({
      date,
      averageScore: Number((scores.reduce((acc, v) => acc + v, 0) / scores.length).toFixed(1)),
      analyses: scores.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalAnalyses: items.length,
    averageCompletionScore: Number((totalScore / items.length).toFixed(1)),
    conclusionMix: normalize(conclusionCounts),
    directionalBiasMix: normalize(biasCounts),
    dailyCompletion,
  };
};

const buildTradeTrendReport = (items: Array<Record<string, unknown>>) => {
  if (items.length === 0) {
    return {
      totalTrades: 0,
      netProfit: 0,
      winRate: 0,
      averageRiskRewardRatio: 0,
      averageJournalScore: 0,
      weeklyStats: [],
      byStrategy: [],
      byAsset: [],
    };
  }

  let netProfit = 0;
  let closedTrades = 0;
  let winningTrades = 0;
  let rrTotal = 0;
  let rrCount = 0;
  let scoreTotal = 0;

  const weekly = new Map<string, {
    trades: number;
    netProfit: number;
    wins: number;
    rrTotal: number;
    rrCount: number;
  }>();

  const byStrategy = new Map<string, { trades: number; netProfit: number; wins: number; rrTotal: number; rrCount: number }>();
  const byAsset = new Map<string, { trades: number; netProfit: number; wins: number; rrTotal: number; rrCount: number }>();

  for (const item of items) {
    const tradeDate = String(item.tradeDate ?? '');
    const profit = toNumber(item.totalProfit);
    const rr = toNumber(item.riskRewardRatio);
    const journalScore = toNumber(item.journalScore) ?? 0;
    const strategy = String(item.strategy ?? 'Unknown');
    const asset = String(item.tradingAsset ?? 'Unknown');

    scoreTotal += journalScore;

    const isClosed = toNumber(item.exitPrice) !== null || profit !== null;
    const isWin = isClosed && profit !== null && profit > 0;

    if (profit !== null) {
      netProfit += profit;
    }

    if (isClosed) {
      closedTrades += 1;
      if (isWin) {
        winningTrades += 1;
      }
    }

    if (rr !== null) {
      rrTotal += rr;
      rrCount += 1;
    }

    const weekKey = getWeekEndingSunday(tradeDate);
    const week = weekly.get(weekKey) ?? {
      trades: 0,
      netProfit: 0,
      wins: 0,
      rrTotal: 0,
      rrCount: 0,
    };
    week.trades += 1;
    week.netProfit += profit ?? 0;
    week.wins += isWin ? 1 : 0;
    if (rr !== null) {
      week.rrTotal += rr;
      week.rrCount += 1;
    }
    weekly.set(weekKey, week);

    const strategyRollup = byStrategy.get(strategy) ?? {
      trades: 0,
      netProfit: 0,
      wins: 0,
      rrTotal: 0,
      rrCount: 0,
    };
    strategyRollup.trades += 1;
    strategyRollup.netProfit += profit ?? 0;
    strategyRollup.wins += isWin ? 1 : 0;
    if (rr !== null) {
      strategyRollup.rrTotal += rr;
      strategyRollup.rrCount += 1;
    }
    byStrategy.set(strategy, strategyRollup);

    const assetRollup = byAsset.get(asset) ?? {
      trades: 0,
      netProfit: 0,
      wins: 0,
      rrTotal: 0,
      rrCount: 0,
    };
    assetRollup.trades += 1;
    assetRollup.netProfit += profit ?? 0;
    assetRollup.wins += isWin ? 1 : 0;
    if (rr !== null) {
      assetRollup.rrTotal += rr;
      assetRollup.rrCount += 1;
    }
    byAsset.set(asset, assetRollup);
  }

  const toRollupArray = (source: Map<string, { trades: number; netProfit: number; wins: number; rrTotal: number; rrCount: number }>) =>
    Array.from(source.entries()).map(([key, value]) => ({
      name: key,
      trades: value.trades,
      netProfit: Number(value.netProfit.toFixed(2)),
      winRate: Number(((value.wins / Math.max(value.trades, 1)) * 100).toFixed(1)),
      averageRiskRewardRatio: Number(((value.rrTotal / Math.max(value.rrCount, 1))).toFixed(2)),
    }));

  return {
    totalTrades: items.length,
    netProfit: Number(netProfit.toFixed(2)),
    winRate: Number(((winningTrades / Math.max(closedTrades, 1)) * 100).toFixed(1)),
    averageRiskRewardRatio: Number((rrTotal / Math.max(rrCount, 1)).toFixed(2)),
    averageJournalScore: Number((scoreTotal / items.length).toFixed(1)),
    weeklyStats: Array.from(weekly.entries())
      .map(([weekEnding, value]) => ({
        weekEnding,
        trades: value.trades,
        netProfit: Number(value.netProfit.toFixed(2)),
        winRate: Number(((value.wins / Math.max(value.trades, 1)) * 100).toFixed(1)),
        averageRiskRewardRatio: Number((value.rrTotal / Math.max(value.rrCount, 1)).toFixed(2)),
      }))
      .sort((a, b) => a.weekEnding.localeCompare(b.weekEnding)),
    byStrategy: toRollupArray(byStrategy).sort((a, b) => b.trades - a.trades),
    byAsset: toRollupArray(byAsset).sort((a, b) => b.trades - a.trades),
  };
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
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
      itemType: 'CHECKLIST',
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

  if (routeKey.endsWith('POST /analysis')) {
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as MarketAnalysisPayload;
    const existingCreatedAt = event.queryStringParameters?.createdAt;
    const existingId = event.queryStringParameters?.id;
    const isUpdate = Boolean(existingCreatedAt && existingId);

    if (!isUpdate && payload.dayId) {
      const allItems = await getAllUserItems(userSub);
      const existingForDay = allItems.find(
        (item) => item.itemType === 'MARKET_ANALYSIS' && String(item.dayId ?? '') === String(payload.dayId),
      );
      if (existingForDay) {
        return json(409, {
          message: 'Market analysis already exists for this trading day',
          id: String(existingForDay.id ?? ''),
          createdAt: String(existingForDay.createdAt ?? ''),
        });
      }
    }

    const createdAt = existingCreatedAt ?? new Date().toISOString();
    const id = existingId ?? crypto.randomUUID();

    const item = {
      userId: userSub,
      createdAt,
      id,
      itemType: 'MARKET_ANALYSIS',
      ...payload,
      analysisScore: scoreAnalysis(payload),
    };

    if (isUpdate) {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: item,
            ConditionExpression: 'id = :id AND itemType = :analysisItemType',
            ExpressionAttributeValues: {
              ':id': id,
              ':analysisItemType': 'MARKET_ANALYSIS',
            },
          }),
        );
      } catch (error) {
        const maybeError = error as { name?: string; message?: string };
        const errorName = maybeError.name ?? '';
        const errorMessage = maybeError.message ?? '';
        if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
          return json(404, { message: 'Market analysis not found' });
        }
        return json(500, { message: 'Failed to update market analysis', detail: errorMessage || 'Unknown error' });
      }
      return json(200, item);
    }

    await client.send(new PutCommand({ TableName: tableName, Item: item }));

    return json(201, item);
  }

  if (routeKey.endsWith('POST /trades')) {
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as TradeLogPayload;
    const existingCreatedAt = event.queryStringParameters?.createdAt;
    const existingId = event.queryStringParameters?.id;
    const isUpdate = Boolean(existingCreatedAt && existingId);
    const createdAt = existingCreatedAt ?? new Date().toISOString();
    const id = existingId ?? crypto.randomUUID();
    const derived = calculateTradeDerivedValues(payload);

    const item = {
      userId: userSub,
      createdAt,
      id,
      itemType: 'TRADE_LOG',
      ...payload,
      estimatedLoss: derived.estimatedLoss ?? payload.estimatedLoss,
      estimatedProfit: derived.estimatedProfit ?? payload.estimatedProfit,
      totalProfit: derived.tradeProfit,
      journalScore: scoreTradeLog(payload),
    };

    if (isUpdate) {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: item,
            ConditionExpression: 'id = :id AND itemType = :tradeItemType',
            ExpressionAttributeValues: {
              ':id': id,
              ':tradeItemType': 'TRADE_LOG',
            },
          }),
        );
      } catch (error) {
        const maybeError = error as { name?: string; message?: string };
        const errorName = maybeError.name ?? '';
        const errorMessage = maybeError.message ?? '';
        if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
          return json(404, { message: 'Trade log not found' });
        }
        return json(500, { message: 'Failed to update trade log', detail: errorMessage || 'Unknown error' });
      }

      return json(200, item);
    }

    await client.send(new PutCommand({ TableName: tableName, Item: item }));
    return json(201, item);
  }

  if (routeKey.endsWith('PUT /trades')) {
    const createdAt = event.queryStringParameters?.createdAt;
    const id = event.queryStringParameters?.id;
    if (!createdAt || !id) {
      return json(400, { message: 'Missing createdAt or id query parameter' });
    }
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as TradeLogPayload;
    const derived = calculateTradeDerivedValues(payload);
    const item = {
      userId: userSub,
      createdAt,
      id,
      itemType: 'TRADE_LOG',
      ...payload,
      estimatedLoss: derived.estimatedLoss ?? payload.estimatedLoss,
      estimatedProfit: derived.estimatedProfit ?? payload.estimatedProfit,
      totalProfit: derived.tradeProfit,
      journalScore: scoreTradeLog(payload),
    };

    try {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
          ConditionExpression: 'id = :id AND itemType = :tradeItemType',
          ExpressionAttributeValues: {
            ':id': id,
            ':tradeItemType': 'TRADE_LOG',
          },
        }),
      );
    } catch (error) {
      const maybeError = error as { name?: string; message?: string };
      const errorName = maybeError.name ?? '';
      const errorMessage = maybeError.message ?? '';
      if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
        return json(404, { message: 'Trade log not found' });
      }
      return json(500, { message: 'Failed to update trade log', detail: errorMessage || 'Unknown error' });
    }

    return json(200, item);
  }

  if (routeKey.endsWith('POST /trading-days')) {
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as TradingDayPayload;
    if (!payload.tradingDate) {
      return json(400, { message: 'Missing tradingDate' });
    }

    const existingCreatedAt = event.queryStringParameters?.createdAt;
    const existingId = event.queryStringParameters?.id;
    const isUpdate = Boolean(existingCreatedAt && existingId);
    if (!isUpdate) {
      const allItems = await getAllUserItems(userSub);
      const duplicate = allItems.find(
        (item) => item.itemType === 'TRADING_DAY' && String(item.tradingDate ?? '') === payload.tradingDate,
      );
      if (duplicate) {
        return json(409, { message: 'A trading day already exists for this date' });
      }
    }
    const createdAt = existingCreatedAt ?? new Date().toISOString();
    const id = existingId ?? crypto.randomUUID();
    const item = {
      userId: userSub,
      createdAt,
      id,
      itemType: 'TRADING_DAY',
      ...payload,
    };

    if (isUpdate) {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: item,
            ConditionExpression: 'id = :id AND itemType = :dayItemType',
            ExpressionAttributeValues: {
              ':id': id,
              ':dayItemType': 'TRADING_DAY',
            },
          }),
        );
      } catch (error) {
        const maybeError = error as { name?: string; message?: string };
        const errorName = maybeError.name ?? '';
        const errorMessage = maybeError.message ?? '';
        if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
          return json(404, { message: 'Trading day not found' });
        }
        return json(500, { message: 'Failed to update trading day', detail: errorMessage || 'Unknown error' });
      }
      return json(200, item);
    }

    await client.send(new PutCommand({ TableName: tableName, Item: item }));
    return json(201, item);
  }

  if (routeKey.endsWith('GET /trading-days')) {
    const days = parseQueryDays(event.queryStringParameters?.days);
    const startIso = getStartIsoForDays(days);

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
        FilterExpression: 'itemType = :dayItemType',
        ExpressionAttributeValues: {
          ':userId': userSub,
          ':startIso': startIso,
          ':dayItemType': 'TRADING_DAY',
        },
        ScanIndexForward: false,
      }),
    );

    return json(200, { items: result.Items ?? [] });
  }

  if (routeKey.endsWith('PUT /trading-days')) {
    const createdAt = event.queryStringParameters?.createdAt;
    const id = event.queryStringParameters?.id;
    if (!createdAt || !id) {
      return json(400, { message: 'Missing createdAt or id query parameter' });
    }
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as TradingDayPayload;
    if (!payload.tradingDate) {
      return json(400, { message: 'Missing tradingDate' });
    }

    const item = {
      userId: userSub,
      createdAt,
      id,
      itemType: 'TRADING_DAY',
      ...payload,
    };

    try {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
          ConditionExpression: 'id = :id AND itemType = :dayItemType',
          ExpressionAttributeValues: {
            ':id': id,
            ':dayItemType': 'TRADING_DAY',
          },
        }),
      );
    } catch (error) {
      const maybeError = error as { name?: string; message?: string };
      const errorName = maybeError.name ?? '';
      const errorMessage = maybeError.message ?? '';
      if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
        return json(404, { message: 'Trading day not found' });
      }
      return json(500, { message: 'Failed to update trading day', detail: errorMessage || 'Unknown error' });
    }

    return json(200, item);
  }

  if (routeKey.endsWith('DELETE /trading-days')) {
    const createdAt = event.queryStringParameters?.createdAt;
    const id = event.queryStringParameters?.id;
    if (!createdAt || !id) {
      return json(400, { message: 'Missing createdAt or id query parameter' });
    }

    const allItems = await getAllUserItems(userSub);
    const sessions = allItems.filter(
      (item) => item.itemType === 'TRADING_SESSION' && String(item.dayId ?? '') === id,
    );
    const trades = allItems.filter(
      (item) => item.itemType === 'SESSION_TRADE' && String(item.dayId ?? '') === id,
    );

    try {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { userId: userSub, createdAt },
          ConditionExpression: 'id = :id AND itemType = :dayItemType',
          ExpressionAttributeValues: {
            ':id': id,
            ':dayItemType': 'TRADING_DAY',
          },
        }),
      );

      await Promise.all([
        ...sessions.map((item) => client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              userId: userSub,
              createdAt: String(item.createdAt ?? ''),
            },
          }),
        )),
        ...trades.map((item) => client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              userId: userSub,
              createdAt: String(item.createdAt ?? ''),
            },
          }),
        )),
      ]);
    } catch (error) {
      const maybeError = error as { name?: string; message?: string };
      const errorName = maybeError.name ?? '';
      const errorMessage = maybeError.message ?? '';
      if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
        return json(404, { message: 'Trading day not found' });
      }
      return json(500, { message: 'Failed to delete trading day', detail: errorMessage || 'Unknown error' });
    }

    return json(200, { deleted: true });
  }

  if (routeKey.endsWith('POST /trading-sessions')) {
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as TradingSessionPayload;
    if (!payload.dayId || !payload.name || !payload.tradingAsset) {
      return json(400, { message: 'Missing required fields: dayId, name, tradingAsset' });
    }

    const existingCreatedAt = event.queryStringParameters?.createdAt;
    const existingId = event.queryStringParameters?.id;
    const isUpdate = Boolean(existingCreatedAt && existingId);
    const createdAt = existingCreatedAt ?? new Date().toISOString();
    const id = existingId ?? crypto.randomUUID();
    const item = {
      userId: userSub,
      createdAt,
      id,
      itemType: 'TRADING_SESSION',
      ...payload,
      confluences: (payload.confluences ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0),
    };

    if (isUpdate) {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: item,
            ConditionExpression: 'id = :id AND itemType = :sessionItemType',
            ExpressionAttributeValues: {
              ':id': id,
              ':sessionItemType': 'TRADING_SESSION',
            },
          }),
        );
      } catch (error) {
        const maybeError = error as { name?: string; message?: string };
        const errorName = maybeError.name ?? '';
        const errorMessage = maybeError.message ?? '';
        if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
          return json(404, { message: 'Trading analysis session not found' });
        }
        return json(500, { message: 'Failed to update trading analysis session', detail: errorMessage || 'Unknown error' });
      }
      return json(200, item);
    }

    await client.send(new PutCommand({ TableName: tableName, Item: item }));
    return json(201, item);
  }

  if (routeKey.endsWith('GET /trading-sessions')) {
    const dayId = event.queryStringParameters?.dayId;
    if (!dayId) {
      return json(400, { message: 'Missing dayId query parameter' });
    }

    const allItems = await getAllUserItems(userSub);
    const items = allItems
      .filter((item) => item.itemType === 'TRADING_SESSION' && String(item.dayId ?? '') === dayId)
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

    return json(200, { items });
  }

  if (routeKey.endsWith('PUT /trading-sessions')) {
    const createdAt = event.queryStringParameters?.createdAt;
    const id = event.queryStringParameters?.id;
    if (!createdAt || !id) {
      return json(400, { message: 'Missing createdAt or id query parameter' });
    }
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as TradingSessionPayload;
    if (!payload.dayId || !payload.name || !payload.tradingAsset) {
      return json(400, { message: 'Missing required fields: dayId, name, tradingAsset' });
    }

    const item = {
      userId: userSub,
      createdAt,
      id,
      itemType: 'TRADING_SESSION',
      ...payload,
      confluences: (payload.confluences ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0),
    };

    try {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
          ConditionExpression: 'id = :id AND itemType = :sessionItemType',
          ExpressionAttributeValues: {
            ':id': id,
            ':sessionItemType': 'TRADING_SESSION',
          },
        }),
      );
    } catch (error) {
      const maybeError = error as { name?: string; message?: string };
      const errorName = maybeError.name ?? '';
      const errorMessage = maybeError.message ?? '';
      if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
        return json(404, { message: 'Trading analysis session not found' });
      }
      return json(500, { message: 'Failed to update trading analysis session', detail: errorMessage || 'Unknown error' });
    }

    return json(200, item);
  }

  if (routeKey.endsWith('DELETE /trading-sessions')) {
    const createdAt = event.queryStringParameters?.createdAt;
    const id = event.queryStringParameters?.id;
    if (!createdAt || !id) {
      return json(400, { message: 'Missing createdAt or id query parameter' });
    }

    const allItems = await getAllUserItems(userSub);
    const trades = allItems.filter(
      (item) => item.itemType === 'SESSION_TRADE' && String(item.sessionId ?? '') === id,
    );

    try {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { userId: userSub, createdAt },
          ConditionExpression: 'id = :id AND itemType = :sessionItemType',
          ExpressionAttributeValues: {
            ':id': id,
            ':sessionItemType': 'TRADING_SESSION',
          },
        }),
      );

      await Promise.all(
        trades.map((item) => client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              userId: userSub,
              createdAt: String(item.createdAt ?? ''),
            },
          }),
        )),
      );
    } catch (error) {
      const maybeError = error as { name?: string; message?: string };
      const errorName = maybeError.name ?? '';
      const errorMessage = maybeError.message ?? '';
      if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
        return json(404, { message: 'Trading analysis session not found' });
      }
      return json(500, { message: 'Failed to delete trading analysis session', detail: errorMessage || 'Unknown error' });
    }

    return json(200, { deleted: true });
  }

  if (routeKey.endsWith('POST /session-trades')) {
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as SessionTradePayload;
    if (!payload.dayId || !payload.tradeDate || !payload.tradingAsset || !payload.strategy) {
      return json(400, { message: 'Missing required fields: dayId, tradeDate, tradingAsset, strategy' });
    }

    const existingCreatedAt = event.queryStringParameters?.createdAt;
    const existingId = event.queryStringParameters?.id;
    const isUpdate = Boolean(existingCreatedAt && existingId);
    const createdAt = existingCreatedAt ?? new Date().toISOString();
    const id = existingId ?? crypto.randomUUID();
    const derived = calculateTradeDerivedValues(payload);

    const item = {
      userId: userSub,
      createdAt,
      id,
      itemType: 'SESSION_TRADE',
      ...payload,
      sessionId: payload.sessionId ?? payload.dayId,
      confluences: (payload.confluences ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0),
      estimatedLoss: derived.estimatedLoss ?? payload.estimatedLoss,
      estimatedProfit: derived.estimatedProfit ?? payload.estimatedProfit,
      totalProfit: derived.tradeProfit,
      journalScore: scoreTradeLog(payload),
    };

    if (isUpdate) {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: item,
            ConditionExpression: 'id = :id AND itemType = :sessionTradeItemType',
            ExpressionAttributeValues: {
              ':id': id,
              ':sessionTradeItemType': 'SESSION_TRADE',
            },
          }),
        );
      } catch (error) {
        const maybeError = error as { name?: string; message?: string };
        const errorName = maybeError.name ?? '';
        const errorMessage = maybeError.message ?? '';
        if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
          return json(404, { message: 'Trade not found' });
        }
        return json(500, { message: 'Failed to update trade', detail: errorMessage || 'Unknown error' });
      }
      return json(200, item);
    }

    await client.send(new PutCommand({ TableName: tableName, Item: item }));
    return json(201, item);
  }

  if (routeKey.endsWith('GET /session-trades')) {
    const sessionId = event.queryStringParameters?.sessionId;
    const dayId = event.queryStringParameters?.dayId;
    if (!sessionId && !dayId) {
      return json(400, { message: 'Missing sessionId or dayId query parameter' });
    }

    const allItems = await getAllUserItems(userSub);
    const items = allItems
      .filter((item) => {
        if (item.itemType !== 'SESSION_TRADE') {
          return false;
        }
        if (sessionId) {
          return String(item.sessionId ?? '') === sessionId;
        }
        return String(item.dayId ?? '') === dayId;
      })
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

    return json(200, { items });
  }

  if (routeKey.endsWith('PUT /session-trades')) {
    const createdAt = event.queryStringParameters?.createdAt;
    const id = event.queryStringParameters?.id;
    if (!createdAt || !id) {
      return json(400, { message: 'Missing createdAt or id query parameter' });
    }
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as SessionTradePayload;
    if (!payload.dayId || !payload.sessionId || !payload.tradeDate || !payload.tradingAsset || !payload.strategy) {
      return json(400, { message: 'Missing required fields: dayId, sessionId, tradeDate, tradingAsset, strategy' });
    }

    const derived = calculateTradeDerivedValues(payload);
    const item = {
      userId: userSub,
      createdAt,
      id,
      itemType: 'SESSION_TRADE',
      ...payload,
      confluences: (payload.confluences ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0),
      estimatedLoss: derived.estimatedLoss ?? payload.estimatedLoss,
      estimatedProfit: derived.estimatedProfit ?? payload.estimatedProfit,
      totalProfit: derived.tradeProfit,
      journalScore: scoreTradeLog(payload),
    };

    try {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
          ConditionExpression: 'id = :id AND itemType = :sessionTradeItemType',
          ExpressionAttributeValues: {
            ':id': id,
            ':sessionTradeItemType': 'SESSION_TRADE',
          },
        }),
      );
    } catch (error) {
      const maybeError = error as { name?: string; message?: string };
      const errorName = maybeError.name ?? '';
      const errorMessage = maybeError.message ?? '';
      if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
        return json(404, { message: 'Trade not found' });
      }
      return json(500, { message: 'Failed to update trade', detail: errorMessage || 'Unknown error' });
    }

    return json(200, item);
  }

  if (routeKey.endsWith('DELETE /session-trades')) {
    const createdAt = event.queryStringParameters?.createdAt;
    const id = event.queryStringParameters?.id;
    if (!createdAt || !id) {
      return json(400, { message: 'Missing createdAt or id query parameter' });
    }

    try {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { userId: userSub, createdAt },
          ConditionExpression: 'id = :id AND itemType = :sessionTradeItemType',
          ExpressionAttributeValues: {
            ':id': id,
            ':sessionTradeItemType': 'SESSION_TRADE',
          },
        }),
      );
    } catch (error) {
      const maybeError = error as { name?: string; message?: string };
      const errorName = maybeError.name ?? '';
      const errorMessage = maybeError.message ?? '';
      if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
        return json(404, { message: 'Trade not found' });
      }
      return json(500, { message: 'Failed to delete trade', detail: errorMessage || 'Unknown error' });
    }

    return json(200, { deleted: true });
  }

  if (routeKey.endsWith('GET /confluences') || routeKey.endsWith('GET /confluences/base')) {
    const [baseItems, customResult] = await Promise.all([
      getOrSeedBaseConfluenceItems(),
      client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
          FilterExpression: 'itemType = :confluenceItemType',
          ExpressionAttributeValues: {
            ':userId': userSub,
            ':startIso': '0000-01-01T00:00:00.000Z',
            ':confluenceItemType': 'CONFLUENCE',
          },
          ScanIndexForward: false,
        }),
      ),
    ]);

    const baseFromDb = baseItems
      .map((item) => ({
        id: String(item.id ?? ''),
        createdAt: String(item.createdAt ?? ''),
        name: String(item.name ?? '').trim(),
        isBase: true,
      }))
      .filter((item) => item.id.length > 0 && item.createdAt.length > 0 && item.name.length > 0);

    const effectiveBase = baseFromDb;

    const custom = (customResult.Items ?? [])
      .map((item) => ({
        id: String(item.id ?? ''),
        createdAt: String(item.createdAt ?? ''),
        name: String(item.name ?? '').trim(),
        isBase: false,
      }))
      .filter((item) => item.id.length > 0 && item.createdAt.length > 0 && item.name.length > 0);

    const seen = new Set<string>();
    const base = effectiveBase.filter((item) => {
      const key = normalizeConfluenceName(item.name);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    const uniqueCustom = custom.filter((item) => {
      const key = normalizeConfluenceName(item.name);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return json(200, {
      items: [...base, ...uniqueCustom],
      base,
      custom: uniqueCustom,
    });
  }

  if (routeKey.endsWith('POST /confluences')) {
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as ConfluencePayload;
    const name = payload.name?.trim() ?? '';
    if (name.length < 2 || name.length > 180) {
      return json(400, { message: 'Confluence name must be between 2 and 180 characters' });
    }

    const [baseItems, customResult] = await Promise.all([
      getOrSeedBaseConfluenceItems(),
      client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
          FilterExpression: 'itemType = :confluenceItemType',
          ExpressionAttributeValues: {
            ':userId': userSub,
            ':startIso': '0000-01-01T00:00:00.000Z',
            ':confluenceItemType': 'CONFLUENCE',
          },
        }),
      ),
    ]);

    const normalizedRequested = normalizeConfluenceName(name);
    const baseSetFromDb = new Set(
      baseItems
        .map((item) => String(item.name ?? ''))
        .map((item) => normalizeConfluenceName(item))
        .filter((item) => item.length > 0),
    );
    const normalizedBase = baseSetFromDb;
    const customSet = new Set(
      (customResult.Items ?? [])
        .map((item) => String(item.name ?? ''))
        .map((item) => normalizeConfluenceName(item))
        .filter((item) => item.length > 0),
    );

    if (normalizedBase.has(normalizedRequested) || customSet.has(normalizedRequested)) {
      return json(409, { message: 'Confluence already exists' });
    }

    const createdAt = new Date().toISOString();
    const id = crypto.randomUUID();
    const item = {
      userId: userSub,
      createdAt,
      id,
      itemType: 'CONFLUENCE',
      name,
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    return json(201, item);
  }

  if (routeKey.endsWith('POST /confluences/base')) {
    if (!isAdministrator(event)) {
      return json(403, { message: 'Administrators only' });
    }

    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as ConfluencePayload;
    const name = payload.name?.trim() ?? '';
    if (name.length < 2 || name.length > 180) {
      return json(400, { message: 'Confluence name must be between 2 and 180 characters' });
    }

    const baseItems = await getOrSeedBaseConfluenceItems();

    const normalizedRequested = normalizeConfluenceName(name);
    const existingBase = new Set(
      baseItems
        .map((item) => String(item.name ?? ''))
        .map((item) => normalizeConfluenceName(item))
        .filter((item) => item.length > 0),
    );
    const effectiveBase = existingBase;

    if (effectiveBase.has(normalizedRequested)) {
      return json(409, { message: 'Base confluence already exists' });
    }

    const createdAt = new Date().toISOString();
    const id = crypto.randomUUID();
    const item = {
      userId: baseConfluenceUserId,
      createdAt,
      id,
      itemType: 'BASE_CONFLUENCE',
      name,
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    return json(201, item);
  }

  if (routeKey.endsWith('PUT /confluences')) {
    const createdAt = event.queryStringParameters?.createdAt;
    const id = event.queryStringParameters?.id;
    if (!createdAt || !id) {
      return json(400, { message: 'Missing createdAt or id query parameter' });
    }
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as ConfluencePayload;
    const name = payload.name?.trim() ?? '';
    if (name.length < 2 || name.length > 180) {
      return json(400, { message: 'Confluence name must be between 2 and 180 characters' });
    }

    const [baseItems, customResult] = await Promise.all([
      getOrSeedBaseConfluenceItems(),
      client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
          FilterExpression: 'itemType = :confluenceItemType',
          ExpressionAttributeValues: {
            ':userId': userSub,
            ':startIso': '0000-01-01T00:00:00.000Z',
            ':confluenceItemType': 'CONFLUENCE',
          },
        }),
      ),
    ]);

    const normalizedRequested = normalizeConfluenceName(name);
    const baseSet = new Set(
      baseItems.map((item) => normalizeConfluenceName(String(item.name ?? ''))).filter((item) => item.length > 0),
    );
    const customSet = new Set(
      (customResult.Items ?? [])
        .filter((item) => !(String(item.id ?? '') === id && String(item.createdAt ?? '') === createdAt))
        .map((item) => normalizeConfluenceName(String(item.name ?? '')))
        .filter((item) => item.length > 0),
    );

    if (baseSet.has(normalizedRequested) || customSet.has(normalizedRequested)) {
      return json(409, { message: 'Confluence already exists' });
    }

    try {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            userId: userSub,
            createdAt,
          },
          ConditionExpression: 'id = :id AND itemType = :confluenceItemType',
          UpdateExpression: 'SET #name = :name',
          ExpressionAttributeNames: {
            '#name': 'name',
          },
          ExpressionAttributeValues: {
            ':id': id,
            ':confluenceItemType': 'CONFLUENCE',
            ':name': name,
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
    } catch (error) {
      const maybeError = error as { name?: string; message?: string };
      const errorName = maybeError.name ?? '';
      const errorMessage = maybeError.message ?? '';
      if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
        return json(404, { message: 'Confluence not found' });
      }
      return json(500, { message: 'Failed to update confluence', detail: errorMessage || 'Unknown error' });
    }

    return json(200, { updated: true });
  }

  if (routeKey.endsWith('PUT /confluences/base')) {
    if (!isAdministrator(event)) {
      return json(403, { message: 'Administrators only' });
    }

    const createdAt = event.queryStringParameters?.createdAt;
    const id = event.queryStringParameters?.id;
    if (!createdAt || !id) {
      return json(400, { message: 'Missing createdAt or id query parameter' });
    }
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as ConfluencePayload;
    const name = payload.name?.trim() ?? '';
    if (name.length < 2 || name.length > 180) {
      return json(400, { message: 'Confluence name must be between 2 and 180 characters' });
    }

    const baseItems = await getOrSeedBaseConfluenceItems();
    const normalizedRequested = normalizeConfluenceName(name);
    const existingBase = new Set(
      baseItems
        .filter((item) => !(String(item.id ?? '') === id && String(item.createdAt ?? '') === createdAt))
        .map((item) => normalizeConfluenceName(String(item.name ?? '')))
        .filter((item) => item.length > 0),
    );

    if (existingBase.has(normalizedRequested)) {
      return json(409, { message: 'Base confluence already exists' });
    }

    try {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            userId: baseConfluenceUserId,
            createdAt,
          },
          ConditionExpression: 'id = :id AND itemType = :baseConfluenceItemType',
          UpdateExpression: 'SET #name = :name',
          ExpressionAttributeNames: {
            '#name': 'name',
          },
          ExpressionAttributeValues: {
            ':id': id,
            ':baseConfluenceItemType': 'BASE_CONFLUENCE',
            ':name': name,
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
    } catch (error) {
      const maybeError = error as { name?: string; message?: string };
      const errorName = maybeError.name ?? '';
      const errorMessage = maybeError.message ?? '';
      if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
        return json(404, { message: 'Base confluence not found' });
      }
      return json(500, { message: 'Failed to update base confluence', detail: errorMessage || 'Unknown error' });
    }

    return json(200, { updated: true });
  }

  if (routeKey.endsWith('DELETE /confluences')) {
    const createdAt = event.queryStringParameters?.createdAt;
    const id = event.queryStringParameters?.id;

    if (!createdAt || !id) {
      return json(400, { message: 'Missing createdAt or id query parameter' });
    }

    try {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            userId: userSub,
            createdAt,
          },
          ConditionExpression: 'id = :id AND itemType = :confluenceItemType',
          ExpressionAttributeValues: {
            ':id': id,
            ':confluenceItemType': 'CONFLUENCE',
          },
        }),
      );
    } catch (error) {
      const maybeError = error as { name?: string; message?: string };
      const errorName = maybeError.name ?? '';
      const errorMessage = maybeError.message ?? '';
      if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
        return json(404, { message: 'Confluence not found' });
      }
      return json(500, { message: 'Failed to delete confluence', detail: errorMessage || 'Unknown error' });
    }

    return json(200, { deleted: true });
  }

  if (routeKey.endsWith('DELETE /confluences/base')) {
    if (!isAdministrator(event)) {
      return json(403, { message: 'Administrators only' });
    }

    const createdAt = event.queryStringParameters?.createdAt;
    const id = event.queryStringParameters?.id;

    if (!createdAt || !id) {
      return json(400, { message: 'Missing createdAt or id query parameter' });
    }

    try {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            userId: baseConfluenceUserId,
            createdAt,
          },
          ConditionExpression: 'id = :id AND itemType = :baseConfluenceItemType',
          ExpressionAttributeValues: {
            ':id': id,
            ':baseConfluenceItemType': 'BASE_CONFLUENCE',
          },
        }),
      );
    } catch (error) {
      const maybeError = error as { name?: string; message?: string };
      const errorName = maybeError.name ?? '';
      const errorMessage = maybeError.message ?? '';
      if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
        return json(404, { message: 'Base confluence not found' });
      }
      return json(500, { message: 'Failed to delete base confluence', detail: errorMessage || 'Unknown error' });
    }

    return json(200, { deleted: true });
  }

  if (routeKey.endsWith('GET /checks')) {
    const days = parseQueryDays(event.queryStringParameters?.days);
    const startIso = getStartIsoForDays(days);

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
        FilterExpression: 'attribute_not_exists(itemType) OR itemType = :checkItemType',
        ExpressionAttributeValues: {
          ':userId': userSub,
          ':startIso': startIso,
          ':checkItemType': 'CHECKLIST',
        },
        ScanIndexForward: false,
      }),
    );

    return json(200, {
      items: result.Items ?? [],
    });
  }

  if (routeKey.endsWith('GET /analysis')) {
    const dayId = event.queryStringParameters?.dayId;
    const days = parseQueryDays(event.queryStringParameters?.days);
    const startIso = getStartIsoForDays(days);

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
        FilterExpression: 'itemType = :analysisItemType',
        ExpressionAttributeValues: {
          ':userId': userSub,
          ':startIso': startIso,
          ':analysisItemType': 'MARKET_ANALYSIS',
        },
        ScanIndexForward: false,
      }),
    );

    const filtered = (result.Items ?? [])
      .filter((item) => (dayId ? String(item.dayId ?? '') === dayId : true))
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

    return json(200, {
      items: filtered,
    });
  }

  if (routeKey.endsWith('DELETE /analysis')) {
    const createdAt = event.queryStringParameters?.createdAt;
    const id = event.queryStringParameters?.id;
    if (!createdAt || !id) {
      return json(400, { message: 'Missing createdAt or id query parameter' });
    }

    try {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            userId: userSub,
            createdAt,
          },
          ConditionExpression: 'id = :id AND itemType = :analysisItemType',
          ExpressionAttributeValues: {
            ':id': id,
            ':analysisItemType': 'MARKET_ANALYSIS',
          },
        }),
      );
    } catch (error) {
      const maybeError = error as { name?: string; message?: string };
      const errorName = maybeError.name ?? '';
      const errorMessage = maybeError.message ?? '';
      if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
        return json(404, { message: 'Market analysis not found' });
      }
      return json(500, { message: 'Failed to delete market analysis', detail: errorMessage || 'Unknown error' });
    }

    return json(200, { deleted: true, createdAt, id });
  }

  if (routeKey.endsWith('GET /trades')) {
    const days = parseQueryDays(event.queryStringParameters?.days);
    const startIso = getStartIsoForDays(days);

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
        FilterExpression: 'itemType = :tradeItemType',
        ExpressionAttributeValues: {
          ':userId': userSub,
          ':startIso': startIso,
          ':tradeItemType': 'TRADE_LOG',
        },
        ScanIndexForward: false,
      }),
    );

    return json(200, {
      items: result.Items ?? [],
    });
  }

    if (routeKey.endsWith('DELETE /trades')) {
      const createdAt = event.queryStringParameters?.createdAt;
      const id = event.queryStringParameters?.id;

      if (!createdAt || !id) {
        return json(400, { message: 'Missing createdAt or id query parameter' });
      }

      try {
        await client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              userId: userSub,
              createdAt,
            },
            ConditionExpression: 'id = :id AND itemType = :tradeItemType',
            ExpressionAttributeValues: {
              ':id': id,
              ':tradeItemType': 'TRADE_LOG',
            },
          }),
        );
      } catch (error) {
        const maybeError = error as { name?: string; message?: string };
        const errorName = maybeError.name ?? '';
        const errorMessage = maybeError.message ?? '';
        if (errorName === 'ConditionalCheckFailedException' || errorMessage.includes('ConditionalCheckFailedException')) {
          return json(404, { message: 'Trade log not found' });
        }
        return json(500, { message: 'Failed to delete trade log', detail: errorMessage || 'Unknown error' });
      }

      return json(200, { deleted: true });
    }

  if (routeKey.endsWith('GET /checks/trends')) {
    const days = parseQueryDays(event.queryStringParameters?.days);
    const startIso = getStartIsoForDays(days);

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
        FilterExpression: 'attribute_not_exists(itemType) OR itemType = :checkItemType',
        ExpressionAttributeValues: {
          ':userId': userSub,
          ':startIso': startIso,
          ':checkItemType': 'CHECKLIST',
        },
      }),
    );

    return json(200, {
      days,
      ...buildTrendReport(result.Items ?? []),
    });
  }

  if (routeKey.endsWith('GET /analysis/trends')) {
    const days = parseQueryDays(event.queryStringParameters?.days);
    const startIso = getStartIsoForDays(days);

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
        FilterExpression: 'itemType = :analysisItemType',
        ExpressionAttributeValues: {
          ':userId': userSub,
          ':startIso': startIso,
          ':analysisItemType': 'MARKET_ANALYSIS',
        },
      }),
    );

    return json(200, {
      days,
      ...buildAnalysisTrendReport(result.Items ?? []),
    });
  }

  if (routeKey.endsWith('GET /trades/trends')) {
    const days = parseQueryDays(event.queryStringParameters?.days);
    const startIso = getStartIsoForDays(days);

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId AND createdAt >= :startIso',
        FilterExpression: 'itemType = :tradeItemType',
        ExpressionAttributeValues: {
          ':userId': userSub,
          ':startIso': startIso,
          ':tradeItemType': 'TRADE_LOG',
        },
      }),
    );

    return json(200, {
      days,
      ...buildTradeTrendReport(result.Items ?? []),
    });
  }

    return json(404, { message: 'Route not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return json(500, { message: 'Request failed', detail: message });
  }
};
