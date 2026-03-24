import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createWorker } from 'tesseract.js';

const s3 = new S3Client({});
const secrets = new SecretsManagerClient({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const tableName = process.env.TRADING_TRACKER_TABLE_NAME ?? '';
const telegramSecretName = process.env.TELEGRAM_SECRET_NAME ?? '';
let telegramSecretCache = null;
const SECRET_PLACEHOLDER = '__SET_ME__';

const getTelegramSecret = async () => {
  if (telegramSecretCache) {
    return telegramSecretCache;
  }
  if (!telegramSecretName) {
    throw new Error('Missing TELEGRAM_SECRET_NAME');
  }
  const response = await secrets.send(new GetSecretValueCommand({
    SecretId: telegramSecretName,
  }));
  telegramSecretCache = JSON.parse(response.SecretString ?? '{}');
  return telegramSecretCache;
};

const getOptionalSecretValue = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === SECRET_PLACEHOLDER ? '' : trimmed;
};

const normalizeStructuredLines = (text) => String(text ?? '')
  .split('\n')
  .map((line) => line.replace(/\r/g, '').trim())
  .filter((line) => line.length > 0 && !/^[-_]{3,}$/.test(line));

const toNumberOrUndefined = (value) => {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  if (normalized.length === 0) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toTradeSide = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'buy' || normalized === 'long') {
    return 'buy';
  }
  if (normalized === 'sell' || normalized === 'short') {
    return 'sell';
  }
  return undefined;
};

const normalizeSessionName = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized.includes('london')) {
    return 'London Open';
  }
  if (normalized.includes('new york') || normalized.includes('newyork') || normalized.includes('ny')) {
    return 'New York Open';
  }
  if (normalized.includes('asia') || normalized.includes('asian')) {
    return 'Asia Session';
  }
  return String(value).trim();
};

const parseDateLine = (value) => {
  const trimmed = String(value ?? '').trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(.+))?$/);
  if (!match) {
    return {};
  }
  return {
    tradeDate: match[1],
    tradeTime: match[2]?.trim() || undefined,
  };
};

const parseNumberedListItem = (line) => {
  const match = line.match(/^\s*(?:[A-Z]+\d+|\d+)\s*[\.\):\-]?\s*(.+)$/i);
  if (!match) {
    return line.trim();
  }
  return match[1].trim();
};

const parseStructuredTelegramTrade = (text) => {
  const lines = normalizeStructuredLines(text);
  if (lines.length === 0) {
    return null;
  }

  const fieldMap = new Map();
  const sections = {
    mainConfluences: [],
    additionalConfluences: [],
    invalidatedConfluences: [],
    comments: [],
    takeProfitApproach: [],
  };

  let currentSection = null;

  for (const line of lines) {
    const sectionMatch = line.match(/^([A-Z][A-Z_ ]+):$/);
    if (sectionMatch) {
      const sectionKey = sectionMatch[1].trim().replace(/\s+/g, '_');
      if (sectionKey === 'MAIN_CONFLUENCES') {
        currentSection = 'mainConfluences';
        continue;
      }
      if (sectionKey === 'ADDITIONAL_CONFLUENCES') {
        currentSection = 'additionalConfluences';
        continue;
      }
      if (sectionKey === 'INVALIDATED_CONFLUENCES') {
        currentSection = 'invalidatedConfluences';
        continue;
      }
      if (sectionKey === 'COMMENTS') {
        currentSection = 'comments';
        continue;
      }
      if (sectionKey === 'TAKE_PROFIT_APPROACH') {
        currentSection = 'takeProfitApproach';
        continue;
      }
      if (sectionKey === 'TRADE_DETAILS') {
        currentSection = null;
        continue;
      }
    }

    const keyValueMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (keyValueMatch) {
      const rawKey = keyValueMatch[1].trim();
      const normalizedKey = rawKey.toUpperCase().replace(/\s+/g, '_');
      const value = keyValueMatch[2].trim();
      fieldMap.set(normalizedKey, value);
      currentSection = null;
      continue;
    }

    if (currentSection) {
      sections[currentSection].push(parseNumberedListItem(line));
    }
  }

  const dateParts = parseDateLine(fieldMap.get('DATE'));
  const mainConfluences = sections.mainConfluences.filter(Boolean);
  const additionalConfluences = sections.additionalConfluences.filter(Boolean);
  const invalidatedConfluences = sections.invalidatedConfluences.filter(Boolean);
  const comments = sections.comments.filter(Boolean);
  const takeProfitApproach = [
    fieldMap.get('TAKE_PROFIT_APPROACH'),
    ...sections.takeProfitApproach,
  ].filter(Boolean).join(' ').trim() || undefined;
  const stage = fieldMap.get('STAGE');
  const sessionName = normalizeSessionName(fieldMap.get('SESSION'));
  const tradingAsset = String(fieldMap.get('SYMBOL') ?? '').trim().toUpperCase();
  const tradeDetailLines = [
    fieldMap.get('LOT') ? `LOT: ${fieldMap.get('LOT')}` : null,
    fieldMap.get('ENTRY') ? `ENTRY: ${fieldMap.get('ENTRY')}` : null,
    fieldMap.get('EXIT') ? `EXIT: ${fieldMap.get('EXIT')}` : null,
    fieldMap.get('PROFIT') ? `PROFIT: ${fieldMap.get('PROFIT')}` : null,
    takeProfitApproach ? `TAKE PROFIT APPROACH: ${takeProfitApproach}` : null,
    fieldMap.get('SL') ? `SL: ${fieldMap.get('SL')}` : null,
    fieldMap.get('TP') ? `TP: ${fieldMap.get('TP')}` : null,
    fieldMap.get('RR') ? `RR: ${fieldMap.get('RR')}` : null,
    sessionName ? `SESSION: ${sessionName}` : null,
  ].filter(Boolean);

  const parsed = {
    ...dateParts,
    sessionName,
    tradingAsset: tradingAsset || undefined,
    strategy: String(fieldMap.get('METHOD') ?? '').trim() || undefined,
    tradeSide: toTradeSide(fieldMap.get('POSITION')),
    lotSize: toNumberOrUndefined(fieldMap.get('LOT')),
    entryPrice: toNumberOrUndefined(fieldMap.get('ENTRY')),
    exitPrice: toNumberOrUndefined(fieldMap.get('EXIT')),
    totalProfit: toNumberOrUndefined(fieldMap.get('PROFIT')),
    stopLossPrice: toNumberOrUndefined(fieldMap.get('SL') ?? fieldMap.get('STOP_LOSS')),
    takeProfitPrice: toNumberOrUndefined(fieldMap.get('TP') ?? fieldMap.get('TAKE_PROFIT')),
    riskRewardRatio: toNumberOrUndefined(fieldMap.get('RR')),
    confluences: [...mainConfluences, ...additionalConfluences],
    invalidatedConfluences,
    comments,
    takeProfitApproach,
    stage,
    method: String(fieldMap.get('METHOD') ?? '').trim() || undefined,
    mainConfluences,
    additionalConfluences,
    tradeDetailLines,
    rawText: lines.join('\n'),
  };

  const hasMinimumTradeFields = Boolean(parsed.tradingAsset && parsed.tradeSide && parsed.entryPrice !== undefined);
  if (!hasMinimumTradeFields) {
    return null;
  }

  return parsed;
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const summarizeScreenshotText = (text) => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const picked = lines.filter((line) => {
    const lower = line.toLowerCase();
    return /entry|sl|stop|tp|target|rr|risk|session|bias|result|setup|confluence|bos|choch|fvg|liquidity/.test(lower);
  });

  return (picked.length > 0 ? picked : lines).slice(0, 12).join('\n');
};

const buildExpertOpinion = (text) => {
  const lower = text.toLowerCase();
  const points = [];

  if (/(break of structure|bos|choch|change of character)/i.test(lower)) {
    points.push('Market structure language suggests the setup is being framed around a shift in trend or continuation logic.');
  }
  if (/(liquidity|sweep|equal highs|equal lows)/i.test(lower)) {
    points.push('There appears to be an emphasis on liquidity interaction, which usually matters most if entry timing is aligned with confirmation.');
  }
  if (/(entry|stop|sl|tp|target)/i.test(lower)) {
    points.push('The screenshot includes explicit execution planning details, so risk-to-reward and invalidation can be reviewed consistently after the trade.');
  }
  if (/(fvg|fair value gap|order block|ob|demand|supply)/i.test(lower)) {
    points.push('The setup references zone-based confluence, so the quality of the trade will depend on how cleanly price reacts at the intended area.');
  }

  if (points.length === 0) {
    points.push('The screenshot contains enough structured annotation to log the setup, but the quality of the trade still depends on whether entry, invalidation, and target logic are all clearly aligned.');
    points.push('Use the extracted notes as a journal aid, then sanity-check whether the setup had a clear reason to exist before execution.');
  }

  return points.slice(0, 4).join(' ');
};

const inferTradingAsset = (text) => {
  const match = text.match(/\b(XAUUSD|XAGUSD|BTCUSD|ETHUSD|NAS100|US30|SPX500|[A-Z]{6})\b/i);
  return match ? match[1].toUpperCase() : 'XAUUSD';
};

const inferTradeSide = (text) => {
  if (/\b(sell|short)\b/i.test(text)) {
    return 'sell';
  }
  if (/\b(buy|long)\b/i.test(text)) {
    return 'buy';
  }
  return undefined;
};

const inferSessionName = (text) => {
  if (/new york|ny session|us session/i.test(text)) {
    return 'New York Open';
  }
  if (/asia|asian session/i.test(text)) {
    return 'Asia Session';
  }
  return 'London Open';
};

const findNumericValue = (text, labels) => {
  const patterns = labels.map((label) => new RegExp(`${label}\\s*[:=]?\\s*([0-9]+(?:\\.[0-9]+)?)`, 'i'));
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }
  return undefined;
};

const inferRiskRewardRatio = (text) => {
  const ratioMatch = text.match(/\b(?:rr|r:r|risk.?reward)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\b/i);
  if (ratioMatch) {
    return Number(ratioMatch[1]);
  }
  const colonMatch = text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*:\s*([0-9]+(?:\.[0-9]+)?)\b/);
  if (colonMatch && Number(colonMatch[1]) > 0) {
    return Number((Number(colonMatch[2]) / Number(colonMatch[1])).toFixed(2));
  }
  return undefined;
};

const calculateTradeDerivedValues = (payload) => {
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

  let totalProfit = payload.totalProfit;
  if (totalProfit === undefined && entry !== undefined && exit !== undefined) {
    const isBuy = payload.tradeSide !== 'sell';
    totalProfit = Number((isBuy ? exit - entry : entry - exit).toFixed(2));
  }

  return { estimatedLoss, estimatedProfit, totalProfit };
};

const scoreTradeLog = (item) => {
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
    item.chartImageData,
  ];

  const step1Done = step1.filter((value) => value !== undefined && value !== '').length;
  const step2Done = step2.filter((value) => value !== undefined && value !== '').length;
  return Number((((step1Done / step1.length) * 60) + ((step2Done / step2.length) * 40)).toFixed(1));
};

const sendTelegramMessage = async (chatId, text, botToken) => {
  if (!botToken || !chatId) {
    return;
  }

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
};

const extractTextWithTesseract = async (inputPath) => {
  const worker = await createWorker('eng');
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
    });
    const { data } = await worker.recognize(inputPath);
    return String(data?.text ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
  } finally {
    await worker.terminate();
  }
};

export const handler = async (event) => {
  if (!tableName) {
    throw new Error('Missing TRADING_TRACKER_TABLE_NAME');
  }

  const {
    screenshotBucket,
    screenshotKey,
    caption = '',
    chatId = '',
    messageId = '',
    targetUserId = '',
  } = event ?? {};

  if (!screenshotBucket || !screenshotKey) {
    throw new Error('Missing OCR event payload fields');
  }

  const tempPath = path.join(tmpdir(), path.basename(screenshotKey));

  try {
    const telegramSecret = await getTelegramSecret();
    const telegramBotToken = getOptionalSecretValue(telegramSecret.botToken);
    const targetUserIdFromSecret = getOptionalSecretValue(telegramSecret.targetUserId);
    const effectiveTargetUserId = targetUserId || targetUserIdFromSecret || chatId;
    if (!effectiveTargetUserId) {
      throw new Error('Missing effective target user id');
    }

    const object = await s3.send(new GetObjectCommand({
      Bucket: screenshotBucket,
      Key: screenshotKey,
    }));
    const imageBuffer = await streamToBuffer(object.Body);
    await fs.writeFile(tempPath, imageBuffer);

    const parsedTrade = parseStructuredTelegramTrade(caption);

    let extractedText = '';
    let extractedSummary = '';
    let expertOpinion = '';
    let payload;

    if (parsedTrade) {
      extractedText = parsedTrade.rawText;
      extractedSummary = parsedTrade.tradeDetailLines.join('\n');
      expertOpinion = buildExpertOpinion([
        parsedTrade.rawText,
        parsedTrade.confluences.join('\n'),
        parsedTrade.comments.join('\n'),
      ].filter(Boolean).join('\n'));

      payload = {
        tradeDate: parsedTrade.tradeDate ?? new Date().toISOString().slice(0, 10),
        tradeTime: parsedTrade.tradeTime,
        sessionName: parsedTrade.sessionName,
        tradingAsset: parsedTrade.tradingAsset,
        strategy: parsedTrade.strategy || 'Telegram Structured Import',
        tradeSide: parsedTrade.tradeSide,
        lotSize: parsedTrade.lotSize,
        confluences: parsedTrade.confluences,
        entryPrice: parsedTrade.entryPrice,
        stopLossPrice: parsedTrade.stopLossPrice,
        takeProfitPrice: parsedTrade.takeProfitPrice,
        riskRewardRatio: parsedTrade.riskRewardRatio,
        exitPrice: parsedTrade.exitPrice,
        totalProfit: parsedTrade.totalProfit,
        feelings: 'Not filled',
        comments: parsedTrade.comments.join('\n') || 'Imported from Telegram screenshot',
        tradeStage: parsedTrade.stage,
        tradeMethod: parsedTrade.method || parsedTrade.strategy || 'Telegram Structured Import',
        tradeDetails: parsedTrade.tradeDetailLines,
        mainConfluences: parsedTrade.mainConfluences,
        additionalConfluences: parsedTrade.additionalConfluences,
        invalidatedConfluences: parsedTrade.invalidatedConfluences,
        commentLines: parsedTrade.comments,
        telegramStructuredImport: true,
        screenshotExtractedDetails: extractedSummary,
        expertOpinion,
        chartImageBucket: screenshotBucket,
        chartImageKey: screenshotKey,
        sourceChannel: 'telegram',
        sourceMessageId: messageId,
        sourceRawText: extractedText,
      };
    } else {
      extractedText = await extractTextWithTesseract(tempPath);
      extractedSummary = summarizeScreenshotText(extractedText);
      expertOpinion = buildExpertOpinion(extractedText);

      const entryPrice = findNumericValue(extractedText, ['entry']);
      const stopLossPrice = findNumericValue(extractedText, ['sl', 'stop loss', 'stop']);
      const takeProfitPrice = findNumericValue(extractedText, ['tp', 'take profit', 'target']);

      payload = {
        tradeDate: new Date().toISOString().slice(0, 10),
        sessionName: inferSessionName(extractedText),
        tradingAsset: inferTradingAsset(extractedText),
        strategy: 'Telegram Screenshot',
        tradeSide: inferTradeSide(extractedText),
        entryPrice,
        stopLossPrice,
        takeProfitPrice,
        riskRewardRatio: inferRiskRewardRatio(extractedText),
        feelings: 'Not filled',
        comments: caption || 'Imported from Telegram screenshot',
        screenshotExtractedDetails: extractedSummary,
        expertOpinion,
        chartImageBucket: screenshotBucket,
        chartImageKey: screenshotKey,
        sourceChannel: 'telegram',
        sourceMessageId: messageId,
        sourceRawText: extractedText,
      };
    }

    const derived = calculateTradeDerivedValues(payload);
    const item = {
      userId: effectiveTargetUserId,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      itemType: 'TRADE_LOG',
      ...payload,
      estimatedLoss: derived.estimatedLoss,
      estimatedProfit: derived.estimatedProfit,
      totalProfit: derived.totalProfit,
      journalScore: scoreTradeLog({ ...payload, ...derived }),
    };

    await dynamo.send(new PutCommand({
      TableName: tableName,
      Item: item,
    }));

    await sendTelegramMessage(
      chatId,
      `Trade logged for ${item.tradingAsset} on ${item.tradeDate}.\n${extractedSummary || 'OCR completed, but extracted summary was empty.'}`,
      telegramBotToken,
    );
  } catch (error) {
    console.error('Telegram OCR failed', { error, screenshotBucket, screenshotKey });
    const telegramSecret = telegramSecretCache ?? await getTelegramSecret().catch(() => ({}));
    await sendTelegramMessage(chatId, 'OCR failed for that screenshot. Please review the image and try again.', telegramSecret.botToken ?? '');
    throw error;
  } finally {
    await fs.rm(tempPath, { force: true });
  }
};
