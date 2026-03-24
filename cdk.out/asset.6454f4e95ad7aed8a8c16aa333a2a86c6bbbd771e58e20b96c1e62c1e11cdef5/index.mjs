import { createRequire } from "module"; const require = createRequire(import.meta.url);

// amplify/functions/tradingApi/handler.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
var client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true
  }
});
var tableName = process.env.TRADING_TRACKER_TABLE_NAME;
var baseConfluenceFallback = [
  "Higher timeframe bias alignmnet",
  "Break & retest",
  "Rejection at high",
  "Moving average - Bullish - Price above 21 & 50 SMA",
  "Moving average - Bullish - 21 crossing above 50",
  "RSI - Above 55",
  "RSI - Below 45",
  "MACD - Histogram expanding in dorection of trade"
];
var baseConfluenceUserId = "__BASE_CONFLUENCES__";
var normalizeAnalysisSessionName = (sessionName) => {
  const normalized = String(sessionName ?? "").trim().toLowerCase();
  if (normalized.includes("asia")) {
    return "asian";
  }
  if (normalized.includes("new york") || normalized === "us session" || normalized === "us") {
    return "us";
  }
  return "london";
};
var json = (statusCode, payload) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
  },
  body: JSON.stringify(payload)
});
var getUserSub = (event) => {
  const claims = event.requestContext.authorizer?.claims;
  if (!claims) {
    return void 0;
  }
  return claims.sub;
};
var getUserGroups = (event) => {
  const claims = event.requestContext.authorizer?.claims;
  if (!claims) {
    return [];
  }
  const rawGroups = claims["cognito:groups"];
  if (!rawGroups) {
    return [];
  }
  if (Array.isArray(rawGroups)) {
    return rawGroups.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }
  if (typeof rawGroups === "string") {
    const trimmed = rawGroups.trim();
    if (trimmed.length === 0) {
      return [];
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter((item) => item.length > 0);
        }
      } catch {
        return [];
      }
    }
    return trimmed.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  }
  return [];
};
var isAdministrator = (event) => getUserGroups(event).includes("Administrators");
var scoreEntry = (item) => {
  const checks = [
    item.environmentReady,
    item.mentallyReady,
    item.emotionallyReadyPrimary,
    item.emotionallyReadySecondary,
    item.commitsRules,
    item.commitsStopLimit,
    item.commitsRiskSizing,
    item.commitsConfirmationOnly
  ];
  const points = checks.filter(Boolean).length;
  return Number((points / checks.length * 100).toFixed(1));
};
var scoreAnalysis = (item) => {
  const sentimentFields = [
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
    item.currentTrend
  ];
  const filledDirectional = sentimentFields.filter((field) => field !== "none").length;
  const keyFields = [
    item.pair,
    item.tradingDate,
    item.sessionName,
    item.conclusion,
    item.newsTimes ?? item.newsTime ?? "",
    item.sellRsiLevel ?? "",
    item.buyRsiLevel ?? ""
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
    item.swingZone2
  ];
  const filledZones = zoneFields.filter((field) => (field ?? "").trim().length > 0).length;
  const marketStructureSet = item.marketStructure.filter((row) => {
    const legacyBiasSet = row.bias && row.bias !== "none";
    const zoneBandSet = row.zoneBand && row.zoneBand !== "neutral";
    const levelSet = (row.level ?? "").trim().length > 0;
    const buySet = (row.buyConfluences ?? "").trim().length > 0;
    const sellSet = (row.sellConfluences ?? "").trim().length > 0;
    return Boolean(legacyBiasSet || zoneBandSet || levelSet || buySet || sellSet);
  }).length;
  const weightedScore = filledDirectional / sentimentFields.length * 40 + filledCore / keyFields.length * 20 + filledZones / zoneFields.length * 20 + marketStructureSet / Math.max(item.marketStructure.length, 1) * 20;
  return Number(weightedScore.toFixed(1));
};
var scoreTradeLog = (item) => {
  const primaryEntry = item.tradeEntries?.[0];
  const primaryTp = primaryEntry?.takeProfits?.[0];
  const step1 = [
    item.tradeDate,
    item.tradeTime,
    item.tradingAsset,
    item.strategy,
    item.confluences && item.confluences.length > 0 ? item.confluences.join(",") : void 0,
    primaryEntry?.entryPrice ?? item.entryPrice,
    item.riskRewardRatio,
    primaryEntry?.stopLossPrice ?? item.stopLossPrice,
    primaryTp?.takeProfitPrice ?? item.takeProfitPrice,
    item.estimatedLoss,
    item.estimatedProfit
  ];
  const step2 = [
    item.exitPrice,
    item.totalProfit,
    item.feelings,
    item.comments,
    item.chartLink,
    item.chartImageData
  ];
  const step1Done = step1.filter((value) => value !== void 0 && value !== "").length;
  const step2Done = step2.filter((value) => value !== void 0 && value !== "").length;
  const weighted = step1Done / step1.length * 60 + step2Done / step2.length * 40;
  return Number(weighted.toFixed(1));
};
var parseQueryDays = (daysParam) => {
  if (!daysParam) {
    return 30;
  }
  const parsed = Number.parseInt(daysParam, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 365) {
    return 30;
  }
  return parsed;
};
var getStartIsoForDays = (days) => {
  const now = /* @__PURE__ */ new Date();
  now.setUTCHours(0, 0, 0, 0);
  now.setUTCDate(now.getUTCDate() - (days - 1));
  return now.toISOString();
};
var getAllUserItems = async (userId) => {
  return queryAllItems({
    TableName: tableName,
    KeyConditionExpression: "userId = :userId AND createdAt >= :startIso",
    ExpressionAttributeValues: {
      ":userId": userId,
      ":startIso": "0000-01-01T00:00:00.000Z"
    }
  });
};
var queryAllItems = async (input) => {
  const items = [];
  let exclusiveStartKey = input.ExclusiveStartKey;
  do {
    const result = await client.send(
      new QueryCommand({
        ...input,
        ExclusiveStartKey: exclusiveStartKey
      })
    );
    items.push(...result.Items ?? []);
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
};
var getWeekEndingSunday = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const day = date.getUTCDay();
  const diff = (7 - day) % 7;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
};
var normalizeConfluenceName = (value) => value.trim().replace(/\s+/g, " ").toLowerCase();
var getOrSeedBaseConfluenceItems = async () => {
  const baseQuery = async () => queryAllItems({
    TableName: tableName,
    KeyConditionExpression: "userId = :userId AND createdAt >= :startIso",
    FilterExpression: "itemType = :baseConfluenceItemType",
    ExpressionAttributeValues: {
      ":userId": baseConfluenceUserId,
      ":startIso": "0000-01-01T00:00:00.000Z",
      ":baseConfluenceItemType": "BASE_CONFLUENCE"
    },
    ScanIndexForward: false
  });
  const firstResult = await baseQuery();
  if (firstResult.length > 0) {
    return firstResult;
  }
  await Promise.all(
    baseConfluenceFallback.map(async (name, index) => {
      const createdAt = `BASE#${String(index + 1).padStart(3, "0")}`;
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              userId: baseConfluenceUserId,
              createdAt,
              id: `base-${index + 1}`,
              itemType: "BASE_CONFLUENCE",
              name
            },
            ConditionExpression: "attribute_not_exists(userId) AND attribute_not_exists(createdAt)"
          })
        );
      } catch {
      }
    })
  );
  const secondResult = await baseQuery();
  return secondResult;
};
var toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
var tradeDirectionIsBuy = (entryPrice, takeProfitPrice, tradeSide) => {
  if (tradeSide === "buy") {
    return true;
  }
  if (tradeSide === "sell") {
    return false;
  }
  if (entryPrice === void 0 || takeProfitPrice === void 0) {
    return true;
  }
  return takeProfitPrice >= entryPrice;
};
var toLotMultiplier = (lotSize) => {
  if (lotSize === void 0 || !Number.isFinite(lotSize) || lotSize <= 0) {
    return 1;
  }
  return lotSize / 0.01;
};
var isPlausibleMarketPrice = (entryPrice, candidatePrice) => {
  if (entryPrice === void 0 || candidatePrice === void 0) {
    return false;
  }
  const lowerBound = Math.abs(entryPrice) * 0.5;
  const upperBound = Math.abs(entryPrice) * 1.5;
  return candidatePrice >= lowerBound && candidatePrice <= upperBound;
};
var calculateTradeEntryProfit = (entry, tradeSide) => {
  if (entry.entryPrice === void 0) {
    return void 0;
  }
  let realized = 0;
  let usedLots = 0;
  const tradeLot = entry.lotSize;
  for (const tp of entry.takeProfits ?? []) {
    if (tp.takeProfitPrice === void 0 || tp.lotSize === void 0 || tp.lotSize <= 0 || !isPlausibleMarketPrice(entry.entryPrice, tp.takeProfitPrice)) {
      continue;
    }
    const move = tradeDirectionIsBuy(entry.entryPrice, tp.takeProfitPrice, tradeSide) ? tp.takeProfitPrice - entry.entryPrice : entry.entryPrice - tp.takeProfitPrice;
    realized += move * toLotMultiplier(tp.lotSize);
    usedLots += tp.lotSize;
  }
  const remainingLots = tradeLot !== void 0 && tradeLot > 0 ? Math.max(tradeLot - usedLots, 0) : 0;
  if (entry.exitPrice !== void 0 && remainingLots > 0) {
    const move = tradeDirectionIsBuy(entry.entryPrice, entry.exitPrice, tradeSide) ? entry.exitPrice - entry.entryPrice : entry.entryPrice - entry.exitPrice;
    realized += move * toLotMultiplier(remainingLots);
    usedLots += remainingLots;
  }
  if (usedLots === 0 && entry.exitPrice !== void 0) {
    const move = tradeDirectionIsBuy(entry.entryPrice, entry.exitPrice, tradeSide) ? entry.exitPrice - entry.entryPrice : entry.entryPrice - entry.exitPrice;
    realized += move * toLotMultiplier(tradeLot);
    usedLots = tradeLot ?? 0.01;
  }
  if (usedLots === 0) {
    return void 0;
  }
  return Number(realized.toFixed(2));
};
var calculateTradeDerivedValues = (payload) => {
  if (payload.tradeEntries && payload.tradeEntries.length > 0) {
    const estimatedLoss2 = payload.tradeEntries[0]?.entryPrice !== void 0 && payload.tradeEntries[0]?.stopLossPrice !== void 0 ? Number(Math.abs(payload.tradeEntries[0].entryPrice - payload.tradeEntries[0].stopLossPrice).toFixed(2)) : void 0;
    const estimatedProfit2 = payload.tradeEntries[0]?.entryPrice !== void 0 && payload.tradeEntries[0]?.takeProfits?.[0]?.takeProfitPrice !== void 0 && isPlausibleMarketPrice(payload.tradeEntries[0].entryPrice, payload.tradeEntries[0].takeProfits[0].takeProfitPrice) ? Number(Math.abs(payload.tradeEntries[0].takeProfits[0].takeProfitPrice - payload.tradeEntries[0].entryPrice).toFixed(2)) : void 0;
    const profits = payload.tradeEntries.map((entry2) => calculateTradeEntryProfit(entry2, payload.tradeSide)).filter((value) => value !== void 0);
    const tradeProfit2 = profits.length > 0 ? Number(profits.reduce((sum, value) => sum + value, 0).toFixed(2)) : payload.totalProfit;
    return { estimatedLoss: estimatedLoss2, estimatedProfit: estimatedProfit2, tradeProfit: tradeProfit2 };
  }
  const entry = payload.entryPrice;
  const stop = payload.stopLossPrice;
  const take = payload.takeProfitPrice;
  const exit = payload.exitPrice;
  const estimatedLoss = entry !== void 0 && stop !== void 0 ? Number(Math.abs(entry - stop).toFixed(2)) : void 0;
  const estimatedProfit = entry !== void 0 && take !== void 0 ? Number(Math.abs(take - entry).toFixed(2)) : void 0;
  const tradeProfit = entry !== void 0 && exit !== void 0 ? Number((tradeDirectionIsBuy(entry, take, payload.tradeSide) ? exit - entry : entry - exit).toFixed(2)) : payload.totalProfit;
  return { estimatedLoss, estimatedProfit, tradeProfit };
};
var buildTrendReport = (items) => {
  if (items.length === 0) {
    return {
      totalCaptures: 0,
      averageScore: 0,
      readinessRates: {},
      dailyScores: []
    };
  }
  const booleanKeys = [
    "environmentReady",
    "mentallyReady",
    "emotionallyReadyPrimary",
    "emotionallyReadySecondary",
    "commitsRules",
    "commitsStopLimit",
    "commitsRiskSizing",
    "commitsConfirmationOnly"
  ];
  const counts = {};
  for (const key of booleanKeys) {
    counts[key] = 0;
  }
  let totalScore = 0;
  const byDate = /* @__PURE__ */ new Map();
  for (const item of items) {
    for (const key of booleanKeys) {
      if (item[key] === true) {
        counts[key] += 1;
      }
    }
    const score = Number(item.score ?? 0);
    totalScore += score;
    const tradingDate = String(item.tradingDate ?? "");
    if (!byDate.has(tradingDate)) {
      byDate.set(tradingDate, []);
    }
    byDate.get(tradingDate)?.push(score);
  }
  const readinessRates = Object.fromEntries(
    booleanKeys.map((key) => [
      key,
      Number((counts[key] / items.length * 100).toFixed(1))
    ])
  );
  const dailyScores = Array.from(byDate.entries()).map(([date, scores]) => ({
    date,
    averageScore: Number((scores.reduce((acc, v) => acc + v, 0) / scores.length).toFixed(1)),
    captures: scores.length
  })).sort((a, b) => a.date.localeCompare(b.date));
  return {
    totalCaptures: items.length,
    averageScore: Number((totalScore / items.length).toFixed(1)),
    readinessRates,
    dailyScores
  };
};
var buildAnalysisTrendReport = (items) => {
  if (items.length === 0) {
    return {
      totalAnalyses: 0,
      averageCompletionScore: 0,
      conclusionMix: {},
      directionalBiasMix: {},
      dailyCompletion: []
    };
  }
  let totalScore = 0;
  const conclusionCounts = {};
  const biasCounts = {};
  const byDate = /* @__PURE__ */ new Map();
  for (const item of items) {
    const score = Number(item.analysisScore ?? 0);
    totalScore += score;
    const conclusion = String(item.conclusion ?? "unknown");
    conclusionCounts[conclusion] = (conclusionCounts[conclusion] ?? 0) + 1;
    const bias = String(item.directionalBias ?? "unknown");
    biasCounts[bias] = (biasCounts[bias] ?? 0) + 1;
    const tradingDate = String(item.tradingDate ?? "");
    if (!byDate.has(tradingDate)) {
      byDate.set(tradingDate, []);
    }
    byDate.get(tradingDate)?.push(score);
  }
  const normalize = (source) => Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      Number((value / items.length * 100).toFixed(1))
    ])
  );
  const dailyCompletion = Array.from(byDate.entries()).map(([date, scores]) => ({
    date,
    averageScore: Number((scores.reduce((acc, v) => acc + v, 0) / scores.length).toFixed(1)),
    analyses: scores.length
  })).sort((a, b) => a.date.localeCompare(b.date));
  return {
    totalAnalyses: items.length,
    averageCompletionScore: Number((totalScore / items.length).toFixed(1)),
    conclusionMix: normalize(conclusionCounts),
    directionalBiasMix: normalize(biasCounts),
    dailyCompletion
  };
};
var buildTradeTrendReport = (items) => {
  if (items.length === 0) {
    return {
      totalTrades: 0,
      netProfit: 0,
      winRate: 0,
      averageRiskRewardRatio: 0,
      averageJournalScore: 0,
      weeklyStats: [],
      byStrategy: [],
      byAsset: []
    };
  }
  let netProfit = 0;
  let closedTrades = 0;
  let winningTrades = 0;
  let rrTotal = 0;
  let rrCount = 0;
  let scoreTotal = 0;
  const weekly = /* @__PURE__ */ new Map();
  const byStrategy = /* @__PURE__ */ new Map();
  const byAsset = /* @__PURE__ */ new Map();
  for (const item of items) {
    const tradeDate = String(item.tradeDate ?? "");
    const profit = toNumber(item.totalProfit);
    const rr = toNumber(item.riskRewardRatio);
    const journalScore = toNumber(item.journalScore) ?? 0;
    const strategy = String(item.strategy ?? "Unknown");
    const asset = String(item.tradingAsset ?? "Unknown");
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
      rrCount: 0
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
      rrCount: 0
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
      rrCount: 0
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
  const toRollupArray = (source) => Array.from(source.entries()).map(([key, value]) => ({
    name: key,
    trades: value.trades,
    netProfit: Number(value.netProfit.toFixed(2)),
    winRate: Number((value.wins / Math.max(value.trades, 1) * 100).toFixed(1)),
    averageRiskRewardRatio: Number((value.rrTotal / Math.max(value.rrCount, 1)).toFixed(2))
  }));
  return {
    totalTrades: items.length,
    netProfit: Number(netProfit.toFixed(2)),
    winRate: Number((winningTrades / Math.max(closedTrades, 1) * 100).toFixed(1)),
    averageRiskRewardRatio: Number((rrTotal / Math.max(rrCount, 1)).toFixed(2)),
    averageJournalScore: Number((scoreTotal / items.length).toFixed(1)),
    weeklyStats: Array.from(weekly.entries()).map(([weekEnding, value]) => ({
      weekEnding,
      trades: value.trades,
      netProfit: Number(value.netProfit.toFixed(2)),
      winRate: Number((value.wins / Math.max(value.trades, 1) * 100).toFixed(1)),
      averageRiskRewardRatio: Number((value.rrTotal / Math.max(value.rrCount, 1)).toFixed(2))
    })).sort((a, b) => a.weekEnding.localeCompare(b.weekEnding)),
    byStrategy: toRollupArray(byStrategy).sort((a, b) => b.trades - a.trades),
    byAsset: toRollupArray(byAsset).sort((a, b) => b.trades - a.trades)
  };
};
var handler = async (event) => {
  try {
    if (!tableName) {
      return json(500, { message: "Missing table configuration" });
    }
    const userSub = getUserSub(event);
    if (!userSub) {
      return json(401, { message: "Unauthorized" });
    }
    const routeKey = `${event.httpMethod} ${event.path}`;
    if (routeKey.endsWith("POST /checks")) {
      if (!event.body) {
        return json(400, { message: "Missing request body" });
      }
      const payload = JSON.parse(event.body);
      const createdAt = (/* @__PURE__ */ new Date()).toISOString();
      const id = crypto.randomUUID();
      const item = {
        userId: userSub,
        createdAt,
        id,
        itemType: "CHECKLIST",
        ...payload,
        score: scoreEntry(payload)
      };
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: item
        })
      );
      return json(201, item);
    }
    if (routeKey.endsWith("POST /analysis")) {
      if (!event.body) {
        return json(400, { message: "Missing request body" });
      }
      const payload = JSON.parse(event.body);
      const existingCreatedAt = event.queryStringParameters?.createdAt;
      const existingId = event.queryStringParameters?.id;
      const isUpdate = Boolean(existingCreatedAt && existingId);
      const allItems = await getAllUserItems(userSub);
      const currentSession = normalizeAnalysisSessionName(payload.sessionName);
      const existingForSession = allItems.find(
        (item2) => item2.itemType === "MARKET_ANALYSIS" && String(item2.tradingDate ?? "") === String(payload.tradingDate) && normalizeAnalysisSessionName(String(item2.sessionName ?? "")) === currentSession && (!isUpdate || String(item2.id ?? "") !== String(existingId ?? ""))
      );
      if (existingForSession) {
        return json(409, {
          message: "Market analysis already exists for this session on this trading date",
          id: String(existingForSession.id ?? ""),
          createdAt: String(existingForSession.createdAt ?? "")
        });
      }
      const createdAt = existingCreatedAt ?? (/* @__PURE__ */ new Date()).toISOString();
      const id = existingId ?? crypto.randomUUID();
      const item = {
        userId: userSub,
        createdAt,
        id,
        itemType: "MARKET_ANALYSIS",
        ...payload,
        analysisScore: scoreAnalysis(payload)
      };
      if (isUpdate) {
        try {
          await client.send(
            new PutCommand({
              TableName: tableName,
              Item: item,
              ConditionExpression: "id = :id AND itemType = :analysisItemType",
              ExpressionAttributeValues: {
                ":id": id,
                ":analysisItemType": "MARKET_ANALYSIS"
              }
            })
          );
        } catch (error) {
          const maybeError = error;
          const errorName = maybeError.name ?? "";
          const errorMessage = maybeError.message ?? "";
          if (errorName === "ConditionalCheckFailedException" || errorMessage.includes("ConditionalCheckFailedException")) {
            return json(404, { message: "Market analysis not found" });
          }
          return json(500, { message: "Failed to update market analysis", detail: errorMessage || "Unknown error" });
        }
        return json(200, item);
      }
      await client.send(new PutCommand({ TableName: tableName, Item: item }));
      return json(201, item);
    }
    if (routeKey.endsWith("POST /trades")) {
      if (!event.body) {
        return json(400, { message: "Missing request body" });
      }
      const payload = JSON.parse(event.body);
      const existingCreatedAt = event.queryStringParameters?.createdAt;
      const existingId = event.queryStringParameters?.id;
      const isUpdate = Boolean(existingCreatedAt && existingId);
      const createdAt = existingCreatedAt ?? (/* @__PURE__ */ new Date()).toISOString();
      const id = existingId ?? crypto.randomUUID();
      const derived = calculateTradeDerivedValues(payload);
      const item = {
        userId: userSub,
        createdAt,
        id,
        itemType: "TRADE_LOG",
        ...payload,
        estimatedLoss: derived.estimatedLoss ?? payload.estimatedLoss,
        estimatedProfit: derived.estimatedProfit ?? payload.estimatedProfit,
        totalProfit: derived.tradeProfit,
        journalScore: scoreTradeLog(payload)
      };
      if (isUpdate) {
        try {
          await client.send(
            new PutCommand({
              TableName: tableName,
              Item: item,
              ConditionExpression: "id = :id AND itemType = :tradeItemType",
              ExpressionAttributeValues: {
                ":id": id,
                ":tradeItemType": "TRADE_LOG"
              }
            })
          );
        } catch (error) {
          const maybeError = error;
          const errorName = maybeError.name ?? "";
          const errorMessage = maybeError.message ?? "";
          if (errorName === "ConditionalCheckFailedException" || errorMessage.includes("ConditionalCheckFailedException")) {
            return json(404, { message: "Trade log not found" });
          }
          return json(500, { message: "Failed to update trade log", detail: errorMessage || "Unknown error" });
        }
        return json(200, item);
      }
      await client.send(new PutCommand({ TableName: tableName, Item: item }));
      return json(201, item);
    }
    if (routeKey.endsWith("PUT /trades")) {
      const createdAt = event.queryStringParameters?.createdAt;
      const id = event.queryStringParameters?.id;
      if (!createdAt || !id) {
        return json(400, { message: "Missing createdAt or id query parameter" });
      }
      if (!event.body) {
        return json(400, { message: "Missing request body" });
      }
      const payload = JSON.parse(event.body);
      const derived = calculateTradeDerivedValues(payload);
      const item = {
        userId: userSub,
        createdAt,
        id,
        itemType: "TRADE_LOG",
        ...payload,
        estimatedLoss: derived.estimatedLoss ?? payload.estimatedLoss,
        estimatedProfit: derived.estimatedProfit ?? payload.estimatedProfit,
        totalProfit: derived.tradeProfit,
        journalScore: scoreTradeLog(payload)
      };
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: item,
            ConditionExpression: "id = :id AND itemType = :tradeItemType",
            ExpressionAttributeValues: {
              ":id": id,
              ":tradeItemType": "TRADE_LOG"
            }
          })
        );
      } catch (error) {
        const maybeError = error;
        const errorName = maybeError.name ?? "";
        const errorMessage = maybeError.message ?? "";
        if (errorName === "ConditionalCheckFailedException" || errorMessage.includes("ConditionalCheckFailedException")) {
          return json(404, { message: "Trade log not found" });
        }
        return json(500, { message: "Failed to update trade log", detail: errorMessage || "Unknown error" });
      }
      return json(200, item);
    }
    if (routeKey.endsWith("GET /confluences") || routeKey.endsWith("GET /confluences/base")) {
      const [baseItems, customItems] = await Promise.all([
        getOrSeedBaseConfluenceItems(),
        queryAllItems({
          TableName: tableName,
          KeyConditionExpression: "userId = :userId AND createdAt >= :startIso",
          FilterExpression: "itemType = :confluenceItemType",
          ExpressionAttributeValues: {
            ":userId": userSub,
            ":startIso": "0000-01-01T00:00:00.000Z",
            ":confluenceItemType": "CONFLUENCE"
          },
          ScanIndexForward: false
        })
      ]);
      const baseFromDb = baseItems.map((item) => ({
        id: String(item.id ?? ""),
        createdAt: String(item.createdAt ?? ""),
        name: String(item.name ?? "").trim(),
        isBase: true
      })).filter((item) => item.id.length > 0 && item.createdAt.length > 0 && item.name.length > 0);
      const effectiveBase = baseFromDb;
      const custom = customItems.map((item) => ({
        id: String(item.id ?? ""),
        createdAt: String(item.createdAt ?? ""),
        name: String(item.name ?? "").trim(),
        isBase: false
      })).filter((item) => item.id.length > 0 && item.createdAt.length > 0 && item.name.length > 0);
      const seen = /* @__PURE__ */ new Set();
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
        custom: uniqueCustom
      });
    }
    if (routeKey.endsWith("POST /confluences")) {
      if (!event.body) {
        return json(400, { message: "Missing request body" });
      }
      const payload = JSON.parse(event.body);
      const name = payload.name?.trim() ?? "";
      if (name.length < 2 || name.length > 180) {
        return json(400, { message: "Confluence name must be between 2 and 180 characters" });
      }
      const [baseItems, customItems] = await Promise.all([
        getOrSeedBaseConfluenceItems(),
        queryAllItems({
          TableName: tableName,
          KeyConditionExpression: "userId = :userId AND createdAt >= :startIso",
          FilterExpression: "itemType = :confluenceItemType",
          ExpressionAttributeValues: {
            ":userId": userSub,
            ":startIso": "0000-01-01T00:00:00.000Z",
            ":confluenceItemType": "CONFLUENCE"
          }
        })
      ]);
      const normalizedRequested = normalizeConfluenceName(name);
      const baseSetFromDb = new Set(
        baseItems.map((item2) => String(item2.name ?? "")).map((item2) => normalizeConfluenceName(item2)).filter((item2) => item2.length > 0)
      );
      const normalizedBase = baseSetFromDb;
      const customSet = new Set(
        customItems.map((item2) => String(item2.name ?? "")).map((item2) => normalizeConfluenceName(item2)).filter((item2) => item2.length > 0)
      );
      if (normalizedBase.has(normalizedRequested) || customSet.has(normalizedRequested)) {
        return json(409, { message: "Confluence already exists" });
      }
      const createdAt = (/* @__PURE__ */ new Date()).toISOString();
      const id = crypto.randomUUID();
      const item = {
        userId: userSub,
        createdAt,
        id,
        itemType: "CONFLUENCE",
        name
      };
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: item
        })
      );
      return json(201, item);
    }
    if (routeKey.endsWith("POST /confluences/base")) {
      if (!isAdministrator(event)) {
        return json(403, { message: "Administrators only" });
      }
      if (!event.body) {
        return json(400, { message: "Missing request body" });
      }
      const payload = JSON.parse(event.body);
      const name = payload.name?.trim() ?? "";
      if (name.length < 2 || name.length > 180) {
        return json(400, { message: "Confluence name must be between 2 and 180 characters" });
      }
      const baseItems = await getOrSeedBaseConfluenceItems();
      const normalizedRequested = normalizeConfluenceName(name);
      const existingBase = new Set(
        baseItems.map((item2) => String(item2.name ?? "")).map((item2) => normalizeConfluenceName(item2)).filter((item2) => item2.length > 0)
      );
      const effectiveBase = existingBase;
      if (effectiveBase.has(normalizedRequested)) {
        return json(409, { message: "Base confluence already exists" });
      }
      const createdAt = (/* @__PURE__ */ new Date()).toISOString();
      const id = crypto.randomUUID();
      const item = {
        userId: baseConfluenceUserId,
        createdAt,
        id,
        itemType: "BASE_CONFLUENCE",
        name
      };
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: item
        })
      );
      return json(201, item);
    }
    if (routeKey.endsWith("PUT /confluences")) {
      const createdAt = event.queryStringParameters?.createdAt;
      const id = event.queryStringParameters?.id;
      if (!createdAt || !id) {
        return json(400, { message: "Missing createdAt or id query parameter" });
      }
      if (!event.body) {
        return json(400, { message: "Missing request body" });
      }
      const payload = JSON.parse(event.body);
      const name = payload.name?.trim() ?? "";
      if (name.length < 2 || name.length > 180) {
        return json(400, { message: "Confluence name must be between 2 and 180 characters" });
      }
      const [baseItems, customItems] = await Promise.all([
        getOrSeedBaseConfluenceItems(),
        queryAllItems({
          TableName: tableName,
          KeyConditionExpression: "userId = :userId AND createdAt >= :startIso",
          FilterExpression: "itemType = :confluenceItemType",
          ExpressionAttributeValues: {
            ":userId": userSub,
            ":startIso": "0000-01-01T00:00:00.000Z",
            ":confluenceItemType": "CONFLUENCE"
          }
        })
      ]);
      const normalizedRequested = normalizeConfluenceName(name);
      const baseSet = new Set(
        baseItems.map((item) => normalizeConfluenceName(String(item.name ?? ""))).filter((item) => item.length > 0)
      );
      const customSet = new Set(
        customItems.filter((item) => !(String(item.id ?? "") === id && String(item.createdAt ?? "") === createdAt)).map((item) => normalizeConfluenceName(String(item.name ?? ""))).filter((item) => item.length > 0)
      );
      if (baseSet.has(normalizedRequested) || customSet.has(normalizedRequested)) {
        return json(409, { message: "Confluence already exists" });
      }
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: {
              userId: userSub,
              createdAt
            },
            ConditionExpression: "id = :id AND itemType = :confluenceItemType",
            UpdateExpression: "SET #name = :name",
            ExpressionAttributeNames: {
              "#name": "name"
            },
            ExpressionAttributeValues: {
              ":id": id,
              ":confluenceItemType": "CONFLUENCE",
              ":name": name
            },
            ReturnValues: "ALL_NEW"
          })
        );
      } catch (error) {
        const maybeError = error;
        const errorName = maybeError.name ?? "";
        const errorMessage = maybeError.message ?? "";
        if (errorName === "ConditionalCheckFailedException" || errorMessage.includes("ConditionalCheckFailedException")) {
          return json(404, { message: "Confluence not found" });
        }
        return json(500, { message: "Failed to update confluence", detail: errorMessage || "Unknown error" });
      }
      return json(200, { updated: true });
    }
    if (routeKey.endsWith("PUT /confluences/base")) {
      if (!isAdministrator(event)) {
        return json(403, { message: "Administrators only" });
      }
      const createdAt = event.queryStringParameters?.createdAt;
      const id = event.queryStringParameters?.id;
      if (!createdAt || !id) {
        return json(400, { message: "Missing createdAt or id query parameter" });
      }
      if (!event.body) {
        return json(400, { message: "Missing request body" });
      }
      const payload = JSON.parse(event.body);
      const name = payload.name?.trim() ?? "";
      if (name.length < 2 || name.length > 180) {
        return json(400, { message: "Confluence name must be between 2 and 180 characters" });
      }
      const baseItems = await getOrSeedBaseConfluenceItems();
      const normalizedRequested = normalizeConfluenceName(name);
      const existingBase = new Set(
        baseItems.filter((item) => !(String(item.id ?? "") === id && String(item.createdAt ?? "") === createdAt)).map((item) => normalizeConfluenceName(String(item.name ?? ""))).filter((item) => item.length > 0)
      );
      if (existingBase.has(normalizedRequested)) {
        return json(409, { message: "Base confluence already exists" });
      }
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: {
              userId: baseConfluenceUserId,
              createdAt
            },
            ConditionExpression: "id = :id AND itemType = :baseConfluenceItemType",
            UpdateExpression: "SET #name = :name",
            ExpressionAttributeNames: {
              "#name": "name"
            },
            ExpressionAttributeValues: {
              ":id": id,
              ":baseConfluenceItemType": "BASE_CONFLUENCE",
              ":name": name
            },
            ReturnValues: "ALL_NEW"
          })
        );
      } catch (error) {
        const maybeError = error;
        const errorName = maybeError.name ?? "";
        const errorMessage = maybeError.message ?? "";
        if (errorName === "ConditionalCheckFailedException" || errorMessage.includes("ConditionalCheckFailedException")) {
          return json(404, { message: "Base confluence not found" });
        }
        return json(500, { message: "Failed to update base confluence", detail: errorMessage || "Unknown error" });
      }
      return json(200, { updated: true });
    }
    if (routeKey.endsWith("DELETE /confluences")) {
      const createdAt = event.queryStringParameters?.createdAt;
      const id = event.queryStringParameters?.id;
      if (!createdAt || !id) {
        return json(400, { message: "Missing createdAt or id query parameter" });
      }
      try {
        await client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              userId: userSub,
              createdAt
            },
            ConditionExpression: "id = :id AND itemType = :confluenceItemType",
            ExpressionAttributeValues: {
              ":id": id,
              ":confluenceItemType": "CONFLUENCE"
            }
          })
        );
      } catch (error) {
        const maybeError = error;
        const errorName = maybeError.name ?? "";
        const errorMessage = maybeError.message ?? "";
        if (errorName === "ConditionalCheckFailedException" || errorMessage.includes("ConditionalCheckFailedException")) {
          return json(404, { message: "Confluence not found" });
        }
        return json(500, { message: "Failed to delete confluence", detail: errorMessage || "Unknown error" });
      }
      return json(200, { deleted: true });
    }
    if (routeKey.endsWith("DELETE /confluences/base")) {
      if (!isAdministrator(event)) {
        return json(403, { message: "Administrators only" });
      }
      const createdAt = event.queryStringParameters?.createdAt;
      const id = event.queryStringParameters?.id;
      if (!createdAt || !id) {
        return json(400, { message: "Missing createdAt or id query parameter" });
      }
      try {
        await client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              userId: baseConfluenceUserId,
              createdAt
            },
            ConditionExpression: "id = :id AND itemType = :baseConfluenceItemType",
            ExpressionAttributeValues: {
              ":id": id,
              ":baseConfluenceItemType": "BASE_CONFLUENCE"
            }
          })
        );
      } catch (error) {
        const maybeError = error;
        const errorName = maybeError.name ?? "";
        const errorMessage = maybeError.message ?? "";
        if (errorName === "ConditionalCheckFailedException" || errorMessage.includes("ConditionalCheckFailedException")) {
          return json(404, { message: "Base confluence not found" });
        }
        return json(500, { message: "Failed to delete base confluence", detail: errorMessage || "Unknown error" });
      }
      return json(200, { deleted: true });
    }
    if (routeKey.endsWith("GET /checks")) {
      const days = parseQueryDays(event.queryStringParameters?.days);
      const startIso = getStartIsoForDays(days);
      const items = await queryAllItems({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId AND createdAt >= :startIso",
        FilterExpression: "attribute_not_exists(itemType) OR itemType = :checkItemType",
        ExpressionAttributeValues: {
          ":userId": userSub,
          ":startIso": startIso,
          ":checkItemType": "CHECKLIST"
        },
        ScanIndexForward: false
      });
      return json(200, {
        items
      });
    }
    if (routeKey.endsWith("GET /analysis")) {
      const tradingDate = event.queryStringParameters?.tradingDate;
      const days = parseQueryDays(event.queryStringParameters?.days);
      const startIso = getStartIsoForDays(days);
      const items = await queryAllItems({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId AND createdAt >= :startIso",
        FilterExpression: "itemType = :analysisItemType",
        ExpressionAttributeValues: {
          ":userId": userSub,
          ":startIso": startIso,
          ":analysisItemType": "MARKET_ANALYSIS"
        },
        ScanIndexForward: false
      });
      const filtered = items.filter((item) => tradingDate ? String(item.tradingDate ?? "") === tradingDate : true).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
      return json(200, {
        items: filtered
      });
    }
    if (routeKey.endsWith("DELETE /analysis")) {
      const createdAt = event.queryStringParameters?.createdAt;
      const id = event.queryStringParameters?.id;
      if (!createdAt || !id) {
        return json(400, { message: "Missing createdAt or id query parameter" });
      }
      try {
        await client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              userId: userSub,
              createdAt
            },
            ConditionExpression: "id = :id AND itemType = :analysisItemType",
            ExpressionAttributeValues: {
              ":id": id,
              ":analysisItemType": "MARKET_ANALYSIS"
            }
          })
        );
      } catch (error) {
        const maybeError = error;
        const errorName = maybeError.name ?? "";
        const errorMessage = maybeError.message ?? "";
        if (errorName === "ConditionalCheckFailedException" || errorMessage.includes("ConditionalCheckFailedException")) {
          return json(404, { message: "Market analysis not found" });
        }
        return json(500, { message: "Failed to delete market analysis", detail: errorMessage || "Unknown error" });
      }
      return json(200, { deleted: true, createdAt, id });
    }
    if (routeKey.endsWith("GET /trades")) {
      const days = parseQueryDays(event.queryStringParameters?.days);
      const startIso = getStartIsoForDays(days);
      const items = await queryAllItems({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId AND createdAt >= :startIso",
        FilterExpression: "itemType = :tradeItemType",
        ExpressionAttributeValues: {
          ":userId": userSub,
          ":startIso": startIso,
          ":tradeItemType": "TRADE_LOG"
        },
        ScanIndexForward: false
      });
      return json(200, {
        items
      });
    }
    if (routeKey.endsWith("DELETE /trades")) {
      const createdAt = event.queryStringParameters?.createdAt;
      const id = event.queryStringParameters?.id;
      if (!createdAt || !id) {
        return json(400, { message: "Missing createdAt or id query parameter" });
      }
      try {
        await client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              userId: userSub,
              createdAt
            },
            ConditionExpression: "id = :id AND itemType = :tradeItemType",
            ExpressionAttributeValues: {
              ":id": id,
              ":tradeItemType": "TRADE_LOG"
            }
          })
        );
      } catch (error) {
        const maybeError = error;
        const errorName = maybeError.name ?? "";
        const errorMessage = maybeError.message ?? "";
        if (errorName === "ConditionalCheckFailedException" || errorMessage.includes("ConditionalCheckFailedException")) {
          return json(404, { message: "Trade log not found" });
        }
        return json(500, { message: "Failed to delete trade log", detail: errorMessage || "Unknown error" });
      }
      return json(200, { deleted: true });
    }
    if (routeKey.endsWith("GET /checks/trends")) {
      const days = parseQueryDays(event.queryStringParameters?.days);
      const startIso = getStartIsoForDays(days);
      const items = await queryAllItems({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId AND createdAt >= :startIso",
        FilterExpression: "attribute_not_exists(itemType) OR itemType = :checkItemType",
        ExpressionAttributeValues: {
          ":userId": userSub,
          ":startIso": startIso,
          ":checkItemType": "CHECKLIST"
        }
      });
      return json(200, {
        days,
        ...buildTrendReport(items)
      });
    }
    if (routeKey.endsWith("GET /analysis/trends")) {
      const days = parseQueryDays(event.queryStringParameters?.days);
      const startIso = getStartIsoForDays(days);
      const items = await queryAllItems({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId AND createdAt >= :startIso",
        FilterExpression: "itemType = :analysisItemType",
        ExpressionAttributeValues: {
          ":userId": userSub,
          ":startIso": startIso,
          ":analysisItemType": "MARKET_ANALYSIS"
        }
      });
      return json(200, {
        days,
        ...buildAnalysisTrendReport(items)
      });
    }
    if (routeKey.endsWith("GET /trades/trends")) {
      const days = parseQueryDays(event.queryStringParameters?.days);
      const startIso = getStartIsoForDays(days);
      const items = await queryAllItems({
        TableName: tableName,
        KeyConditionExpression: "userId = :userId AND createdAt >= :startIso",
        FilterExpression: "itemType = :tradeItemType",
        ExpressionAttributeValues: {
          ":userId": userSub,
          ":startIso": startIso,
          ":tradeItemType": "TRADE_LOG"
        }
      });
      return json(200, {
        days,
        ...buildTradeTrendReport(items)
      });
    }
    return json(404, { message: "Route not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return json(500, { message: "Request failed", detail: message });
  }
};
export {
  handler
};
