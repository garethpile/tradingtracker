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

type AnalysisDirection = 'bullish' | 'bearish' | 'consolidation' | 'none';
type MarketStructureBias = 'buy' | 'sell' | 'none';
type Impact = 'high' | 'low';

type MarketAnalysisPayload = {
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

const getWeekStart = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
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

    const weekKey = getWeekStart(tradeDate);
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
      .map(([weekStart, value]) => ({
        weekStart,
        trades: value.trades,
        netProfit: Number(value.netProfit.toFixed(2)),
        winRate: Number(((value.wins / Math.max(value.trades, 1)) * 100).toFixed(1)),
        averageRiskRewardRatio: Number((value.rrTotal / Math.max(value.rrCount, 1)).toFixed(2)),
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    byStrategy: toRollupArray(byStrategy).sort((a, b) => b.trades - a.trades),
    byAsset: toRollupArray(byAsset).sort((a, b) => b.trades - a.trades),
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
    const createdAt = new Date().toISOString();
    const id = crypto.randomUUID();

    const item = {
      userId: userSub,
      createdAt,
      id,
      itemType: 'MARKET_ANALYSIS',
      ...payload,
      analysisScore: scoreAnalysis(payload),
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    return json(201, item);
  }

  if (routeKey.endsWith('POST /trades')) {
    if (!event.body) {
      return json(400, { message: 'Missing request body' });
    }

    const payload = JSON.parse(event.body) as TradeLogPayload;
    const createdAt = new Date().toISOString();
    const id = crypto.randomUUID();
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

    return json(200, {
      items: result.Items ?? [],
    });
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
};
