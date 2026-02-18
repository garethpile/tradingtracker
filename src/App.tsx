import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../amplify_outputs.json';
import './App.css';

type MenuTab = 'checklist' | 'tradeCalc' | 'trades' | 'confluences';

type ChecklistItem = {
  id: string;
  createdAt: string;
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
  score: number;
  signature: string;
  notes?: string;
};

type TrendResponse = {
  days: number;
  totalCaptures: number;
  averageScore: number;
  readinessRates: Record<string, number>;
  dailyScores: Array<{ date: string; averageScore: number; captures: number }>;
};

type AnalysisDirection = 'bullish' | 'bearish' | 'consolidation' | 'none';
type Impact = 'high' | 'low';
type MarketStructureBias = 'buy' | 'sell' | 'none';

type AnalysisFormState = {
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
  prevDayLow: string;
  prevDayHigh: string;
  currentDayLow: string;
  currentDayHigh: string;
  futuresPrice: string;
  priceActionNotes: string;
  redFolderNews: boolean;
  newsImpact: Impact;
  newsTime: string;
  newsNotes: string;
  sellRsiLevel: string;
  buyRsiLevel: string;
  hasClearTrend: boolean;
  currentTrend: AnalysisDirection;
  directionalBias: 'bullish' | 'bearish' | 'none';
  tradingStyle: 'trend' | 'consolidation';
  tradingNotes: string;
  sellZone1: string;
  sellZone2: string;
  sellZone3: string;
  buyZone1: string;
  buyZone2: string;
  buyZone3: string;
  reversalZone1: string;
  reversalZone2: string;
  swingZone1: string;
  swingZone2: string;
  marketStructure: Array<{
    rangeName: string;
    bias: MarketStructureBias;
    level: string;
  }>;
};

type TradeLogFormState = {
  tradeDate: string;
  tradeTime: string;
  sessionName: string;
  pair: string;
  fundamentalsSentiment: 'bullish' | 'bearish' | 'consolidation';
  movingAverages5m: 'bullish' | 'bearish' | 'consolidation';
  patternsTrend5m: 'bullish' | 'bearish' | 'consolidation';
  movingAverages1h: 'bullish' | 'bearish' | 'consolidation';
  patternsTrend1h: 'bullish' | 'bearish' | 'consolidation';
  relativeStrength5m: 'bullish' | 'bearish' | 'consolidation';
  relativeStrength1h: 'bullish' | 'bearish' | 'consolidation';
  candle1h: 'bullish' | 'bearish' | 'consolidation';
  candle4h: 'bullish' | 'bearish' | 'consolidation';
  candleDaily: 'bullish' | 'bearish' | 'consolidation';
  candleWeekly: 'bullish' | 'bearish' | 'consolidation';
  candleMonthly: 'bullish' | 'bearish' | 'consolidation';
  analysisConclusion: AnalysisFormState['conclusion'];
  prevDayLow: string;
  prevDayHigh: string;
  currentDayLow: string;
  currentDayHigh: string;
  currentTrend: AnalysisDirection;
  directionalBias: AnalysisFormState['directionalBias'];
  tradingStyle: AnalysisFormState['tradingStyle'];
  futuresPrice: string;
  priceActionNotes: string;
  redFolderNews: boolean;
  newsImpact: Impact;
  newsTime: string;
  newsNotes: string;
  sellRsiLevel: string;
  buyRsiLevel: string;
  hasClearTrend: boolean;
  tradingNotes: string;
  sellZone1: string;
  sellZone2: string;
  sellZone3: string;
  buyZone1: string;
  buyZone2: string;
  buyZone3: string;
  reversalZone1: string;
  reversalZone2: string;
  swingZone1: string;
  swingZone2: string;
  marketStructure: Array<{
    rangeName: string;
    bias: MarketStructureBias;
    level: string;
  }>;
  tradingAsset: string;
  tradeSide: 'buy' | 'sell';
  strategy: string;
  confluences: string[];
  entryPrice: string;
  riskRewardRatio: string;
  stopLossPrice: string;
  takeProfitPrice: string;
  exitPrice: string;
  feelings: 'Satisfied' | 'Neutral' | 'Disappointed' | 'Not filled';
  comments: string;
  chartLink: string;
};

type TradeLogItem = {
  id: string;
  createdAt: string;
  tradeDate: string;
  tradeTime?: string;
  sessionName?: string;
  tradingAsset: string;
  strategy: string;
  tradeSide?: 'buy' | 'sell';
  confluences?: string[];
  entryPrice?: number;
  riskRewardRatio?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  estimatedLoss?: number;
  estimatedProfit?: number;
  exitPrice?: number;
  totalProfit?: number;
  feelings?: string;
  comments?: string;
  chartLink?: string;
  journalScore: number;
};

type TradingDayItem = {
  id: string;
  createdAt: string;
  tradingDate: string;
  title?: string;
  notes?: string;
};

type SessionTradeItem = TradeLogItem & {
  dayId: string;
  sessionId?: string;
  pair?: string;
  analysisConclusion?: AnalysisFormState['conclusion'];
  fundamentalsSentiment?: 'bullish' | 'bearish' | 'consolidation';
  movingAverages5m?: 'bullish' | 'bearish' | 'consolidation';
  patternsTrend5m?: 'bullish' | 'bearish' | 'consolidation';
  movingAverages1h?: 'bullish' | 'bearish' | 'consolidation';
  patternsTrend1h?: 'bullish' | 'bearish' | 'consolidation';
  relativeStrength5m?: 'bullish' | 'bearish' | 'consolidation';
  relativeStrength1h?: 'bullish' | 'bearish' | 'consolidation';
  candle1h?: 'bullish' | 'bearish' | 'consolidation';
  candle4h?: 'bullish' | 'bearish' | 'consolidation';
  candleDaily?: 'bullish' | 'bearish' | 'consolidation';
  candleWeekly?: 'bullish' | 'bearish' | 'consolidation';
  candleMonthly?: 'bullish' | 'bearish' | 'consolidation';
  prevDayLow?: string;
  prevDayHigh?: string;
  currentDayLow?: string;
  currentDayHigh?: string;
  currentTrend?: AnalysisDirection;
  directionalBias?: AnalysisFormState['directionalBias'];
  tradingStyle?: AnalysisFormState['tradingStyle'];
  futuresPrice?: string;
  priceActionNotes?: string;
  redFolderNews?: boolean;
  newsImpact?: Impact;
  newsTime?: string;
  newsNotes?: string;
  sellRsiLevel?: string;
  buyRsiLevel?: string;
  hasClearTrend?: boolean;
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
  marketStructure?: Array<{
    rangeName: string;
    bias: MarketStructureBias;
    level: string;
  }>;
};

type ConfluenceItem = {
  id: string;
  createdAt: string;
  name: string;
  isBase: boolean;
};

type ConfluenceResponse = {
  items: ConfluenceItem[];
  base: ConfluenceItem[];
  custom: ConfluenceItem[];
};

type FormState = {
  tradingDate: string;
  sessionName: string;
  environmentReady: boolean;
  mentallyReady: boolean;
  emotionallyReadyPrimary: boolean;
  emotionallyReadySecondary: boolean;
  commitsRules: boolean;
  commitsStopLimit: boolean;
  commitsRiskSizing: boolean;
  commitsConfirmationOnly: boolean;
  signature: string;
  notes: string;
};

type BooleanFormKey =
  | 'environmentReady'
  | 'mentallyReady'
  | 'emotionallyReadyPrimary'
  | 'emotionallyReadySecondary'
  | 'commitsRules'
  | 'commitsStopLimit'
  | 'commitsRiskSizing'
  | 'commitsConfirmationOnly';

const defaultChecklistForm = (): FormState => ({
  tradingDate: new Date().toISOString().slice(0, 10),
  sessionName: 'London Open',
  environmentReady: true,
  mentallyReady: true,
  emotionallyReadyPrimary: true,
  emotionallyReadySecondary: true,
  commitsRules: true,
  commitsStopLimit: true,
  commitsRiskSizing: true,
  commitsConfirmationOnly: true,
  signature: '',
  notes: '',
});

const defaultTradeForm = (): TradeLogFormState => ({
  tradeDate: new Date().toISOString().slice(0, 10),
  tradeTime: new Date().toTimeString().slice(0, 5),
  sessionName: 'London Open',
  pair: 'XAUUSD',
  fundamentalsSentiment: 'bullish',
  movingAverages5m: 'bullish',
  patternsTrend5m: 'bullish',
  movingAverages1h: 'bullish',
  patternsTrend1h: 'bullish',
  relativeStrength5m: 'bullish',
  relativeStrength1h: 'bullish',
  candle1h: 'bullish',
  candle4h: 'bullish',
  candleDaily: 'bullish',
  candleWeekly: 'bullish',
  candleMonthly: 'bullish',
  analysisConclusion: 'bullish',
  prevDayLow: '',
  prevDayHigh: '',
  currentDayLow: '',
  currentDayHigh: '',
  currentTrend: 'bullish',
  directionalBias: 'bullish',
  tradingStyle: 'trend',
  futuresPrice: '',
  priceActionNotes: '',
  redFolderNews: false,
  newsImpact: 'high',
  newsTime: '',
  newsNotes: '',
  sellRsiLevel: '',
  buyRsiLevel: '',
  hasClearTrend: true,
  tradingNotes: '',
  sellZone1: '',
  sellZone2: '',
  sellZone3: '',
  buyZone1: '',
  buyZone2: '',
  buyZone3: '',
  reversalZone1: '',
  reversalZone2: '',
  swingZone1: '',
  swingZone2: '',
  marketStructure: Array.from({ length: 13 }, (_, index) => ({
    rangeName: `Range ${index + 1}`,
    bias: 'none',
    level: '',
  })),
  tradingAsset: 'XAUUSD',
  tradeSide: 'buy',
  strategy: '',
  confluences: [''],
  entryPrice: '',
  riskRewardRatio: '',
  stopLossPrice: '',
  takeProfitPrice: '',
  exitPrice: '',
  feelings: 'Not filled',
  comments: '',
  chartLink: '',
});

const defaultTradingDayForm = () => ({
  tradingDate: new Date().toISOString().slice(0, 10),
  title: '',
  notes: '',
});

const outputConfig = {
  apiUrl: (outputs as { custom?: { tradingTrackerApiUrl?: string } }).custom?.tradingTrackerApiUrl
    || (import.meta.env.VITE_TRADING_API_URL as string | undefined)
    || '',
};

const lotSizeOptions = [
  { lotSize: 0.01, dollarsPerPoint: 1 },
  { lotSize: 0.1, dollarsPerPoint: 10 },
  { lotSize: 1.0, dollarsPerPoint: 100 },
  { lotSize: 10.0, dollarsPerPoint: 1000 },
];

const checklistLabels: Array<{ key: BooleanFormKey; label: string; kind: 'question' | 'commitment' }> = [
  { key: 'environmentReady', label: 'Is my environment set up for this session?', kind: 'question' },
  { key: 'mentallyReady', label: 'Do I feel mentally ready for this session?', kind: 'question' },
  {
    key: 'emotionallyReadyPrimary',
    label: 'Do I feel emotionally steady for this session?',
    kind: 'question',
  },
  {
    key: 'emotionallyReadySecondary',
    label: 'Do I feel emotionally ready for this session?',
    kind: 'question',
  },
  {
    key: 'commitsRules',
    label: 'I only enter trades based on rules and strategy.',
    kind: 'commitment',
  },
  {
    key: 'commitsStopLimit',
    label: 'I stop trading once I hit my daily profit/loss limit.',
    kind: 'commitment',
  },
  {
    key: 'commitsRiskSizing',
    label: 'I do not overcommit on lot sizing.',
    kind: 'commitment',
  },
  {
    key: 'commitsConfirmationOnly',
    label: 'I only trade on confirmation.',
    kind: 'commitment',
  },
];

const defaultConfluenceOptions = [
  'Higher timeframe bias alignmnet',
  'Break & retest',
  'Rejection at high',
  'Moving average - Bullish - Price above 21 & 50 SMA',
  'Moving average - Bullish - 21 crossing above 50',
  'RSI - Above 55',
  'RSI - Below 45',
  'MACD - Histogram expanding in dorection of trade',
];

const preMarketChecklistFields = [
  { key: 'fundamentalsSentiment', label: 'Fundamentals | News sentiment' },
  { key: 'movingAverages5m', label: 'Moving averages | 5 min' },
  { key: 'patternsTrend5m', label: 'Patterns trend | 5 min' },
  { key: 'movingAverages1h', label: 'Moving averages | 1 hour' },
  { key: 'patternsTrend1h', label: 'Patterns trend | 1 hour' },
  { key: 'relativeStrength5m', label: 'Relative strength | 5 min' },
  { key: 'relativeStrength1h', label: 'Relative strength | 1 hour' },
  { key: 'candle1h', label: 'Candle | 1 hour' },
  { key: 'candle4h', label: 'Candle | 4 hour' },
  { key: 'candleDaily', label: 'Candle | Daily' },
  { key: 'candleWeekly', label: 'Candle | Weekly' },
  { key: 'candleMonthly', label: 'Candle | Monthly' },
] as const;

const directionOptions: Array<{ value: 'bullish' | 'bearish' | 'consolidation'; label: string }> = [
  { value: 'bullish', label: 'Bullish' },
  { value: 'bearish', label: 'Bearish' },
  { value: 'consolidation', label: 'Consolidation' },
];

const getIsAdminFromSession = async (): Promise<boolean> => {
  const session = await fetchAuthSession();
  const groupsClaim = session.tokens?.idToken?.payload?.['cognito:groups'];
  if (!groupsClaim) {
    return false;
  }

  if (Array.isArray(groupsClaim)) {
    return groupsClaim.some((entry) => String(entry) === 'Administrators');
  }

  if (typeof groupsClaim === 'string') {
    return groupsClaim.split(',').map((entry) => entry.trim()).includes('Administrators');
  }

  return false;
};

const toNumberOrUndefined = (value: string): number | undefined => {
  if (value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toInputString = (value?: number): string => {
  if (value === undefined) {
    return '';
  }

  return String(value);
};

const computeEstimatedLoss = (entry?: number, stopLoss?: number): number | undefined => {
  if (entry === undefined || stopLoss === undefined) {
    return undefined;
  }

  return Number(Math.abs(entry - stopLoss).toFixed(2));
};

const computeEstimatedProfit = (entry?: number, takeProfit?: number): number | undefined => {
  if (entry === undefined || takeProfit === undefined) {
    return undefined;
  }

  return Number(Math.abs(takeProfit - entry).toFixed(2));
};

const computeTradeProfit = (
  entry?: number,
  exit?: number,
  tradeSide: 'buy' | 'sell' = 'buy',
  takeProfit?: number,
): number | undefined => {
  if (entry === undefined || exit === undefined) {
    return undefined;
  }

  const isBuy = tradeSide === 'buy' || (tradeSide !== 'sell' && (takeProfit === undefined ? true : takeProfit >= entry));
  const raw = isBuy ? exit - entry : entry - exit;
  return Number(raw.toFixed(2));
};

const buildAuthHeader = async () => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();

  if (!token) {
    throw new Error('No auth session token found');
  }

  return `Bearer ${token}`;
};

const apiCall = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  if (!outputConfig.apiUrl) {
    throw new Error('API URL missing. Deploy backend and pull amplify_outputs.json.');
  }

  const authHeader = await buildAuthHeader();
  const response = await fetch(`${outputConfig.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
};

function App() {
  return (
    <Authenticator signUpAttributes={['email', 'phone_number']}>
      {({ signOut, user }) => (
        <TradingDashboard email={user?.signInDetails?.loginId ?? ''} onSignOut={signOut} />
      )}
    </Authenticator>
  );
}

function TradingDashboard({ email, onSignOut }: { email: string; onSignOut?: (() => void) | undefined }) {
  const [activeTab, setActiveTab] = useState<MenuTab>('checklist');
  const [checklistForm, setChecklistForm] = useState<FormState>(defaultChecklistForm);
  const [tradeForm, setTradeForm] = useState<TradeLogFormState>(defaultTradeForm);

  const [checklistHistory, setChecklistHistory] = useState<ChecklistItem[]>([]);
  const [tradingDays, setTradingDays] = useState<TradingDayItem[]>([]);
  const [dayTrades, setDayTrades] = useState<SessionTradeItem[]>([]);
  const [selectedTradingDayId, setSelectedTradingDayId] = useState<string | null>(null);
  const [editingSessionTrade, setEditingSessionTrade] = useState<{ id: string; createdAt: string } | null>(null);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [tradingDayDialogOpen, setTradingDayDialogOpen] = useState(false);
  const [tradingDayForm, setTradingDayForm] = useState(defaultTradingDayForm);
  const [tradingDayYearFilter, setTradingDayYearFilter] = useState('all');
  const [tradingDayMonthFilter, setTradingDayMonthFilter] = useState('all');
  const [tradingDaySearch, setTradingDaySearch] = useState('');
  const [confluenceItems, setConfluenceItems] = useState<ConfluenceItem[]>([]);
  const [baseConfluences, setBaseConfluences] = useState<ConfluenceItem[]>([]);
  const [customConfluences, setCustomConfluences] = useState<ConfluenceItem[]>([]);
  const [newConfluence, setNewConfluence] = useState('');
  const [newBaseConfluence, setNewBaseConfluence] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingConfluenceKey, setEditingConfluenceKey] = useState<string | null>(null);
  const [editingConfluenceValue, setEditingConfluenceValue] = useState('');
  const [analysisSectionOpen, setAnalysisSectionOpen] = useState({
    preMarket: true,
    priceAction: true,
    newsNotes: true,
    pullBackLevels: true,
    tradingNotes: true,
    potentialZones: true,
    marketStructure: true,
  });

  const [checklistTrends, setChecklistTrends] = useState<TrendResponse | null>(null);
  const [selectedLotSize, setSelectedLotSize] = useState<number>(0.1);
  const [totalAmountToLose, setTotalAmountToLose] = useState<string>('');
  const [riskRewardRatioCalc, setRiskRewardRatioCalc] = useState<string>('2');

  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checklistPreview = useMemo(() => {
    const fields = checklistLabels.map((item) => checklistForm[item.key]);
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [checklistForm]);

  const confluenceSuggestions = useMemo(() => {
    const normalized = new Set<string>();
    const names = [
      ...defaultConfluenceOptions,
      ...confluenceItems.map((item) => item.name),
    ];

    return names
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
      .filter((name) => {
        const key = name.toLowerCase();
        if (normalized.has(key)) {
          return false;
        }
        normalized.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  }, [confluenceItems]);

  const entryPriceValue = toNumberOrUndefined(tradeForm.entryPrice);
  const stopLossPriceValue = toNumberOrUndefined(tradeForm.stopLossPrice);
  const takeProfitPriceValue = toNumberOrUndefined(tradeForm.takeProfitPrice);
  const exitPriceValue = toNumberOrUndefined(tradeForm.exitPrice);
  const estimatedLossValue = computeEstimatedLoss(entryPriceValue, stopLossPriceValue);
  const estimatedProfitValue = computeEstimatedProfit(entryPriceValue, takeProfitPriceValue);
  const tradeProfitValue = computeTradeProfit(entryPriceValue, exitPriceValue, tradeForm.tradeSide, takeProfitPriceValue);
  const selectedTradingDay = useMemo(
    () => tradingDays.find((item) => item.id === selectedTradingDayId) ?? null,
    [tradingDays, selectedTradingDayId],
  );
  const tradingDayYears = useMemo(
    () => Array.from(new Set(tradingDays.map((item) => item.tradingDate.slice(0, 4)))).sort((a, b) => b.localeCompare(a)),
    [tradingDays],
  );
  const filteredTradingDays = useMemo(
    () => tradingDays
      .filter((item) => (tradingDayYearFilter === 'all' ? true : item.tradingDate.slice(0, 4) === tradingDayYearFilter))
      .filter((item) => (tradingDayMonthFilter === 'all' ? true : item.tradingDate.slice(5, 7) === tradingDayMonthFilter))
      .filter((item) => {
        const q = tradingDaySearch.trim().toLowerCase();
        if (!q) {
          return true;
        }
        return item.tradingDate.toLowerCase().includes(q) || (item.title ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => `${b.tradingDate}-${b.createdAt}`.localeCompare(`${a.tradingDate}-${a.createdAt}`)),
    [tradingDays, tradingDayMonthFilter, tradingDaySearch, tradingDayYearFilter],
  );
  const selectedLotConfig = useMemo(
    () => lotSizeOptions.find((option) => option.lotSize === selectedLotSize) ?? lotSizeOptions[1],
    [selectedLotSize],
  );
  const totalAmountNumber = useMemo(() => toNumberOrUndefined(totalAmountToLose) ?? 0, [totalAmountToLose]);
  const riskRewardRatioNumber = useMemo(() => toNumberOrUndefined(riskRewardRatioCalc) ?? 2, [riskRewardRatioCalc]);
  const dividedBy100Trades = useMemo(
    () => Number((totalAmountNumber / 100).toFixed(2)),
    [totalAmountNumber],
  );
  const moveDownPerTradeLoss = dividedBy100Trades;
  const moveUpPerTradeProfit = useMemo(
    () => Number((moveDownPerTradeLoss * Math.max(riskRewardRatioNumber, 0)).toFixed(2)),
    [moveDownPerTradeLoss, riskRewardRatioNumber],
  );
  const absoluteSlDown = useMemo(
    () => Number((selectedLotConfig.dollarsPerPoint === 0 ? 0 : moveDownPerTradeLoss / selectedLotConfig.dollarsPerPoint).toFixed(2)),
    [moveDownPerTradeLoss, selectedLotConfig.dollarsPerPoint],
  );
  const upsideProfit = useMemo(
    () => Number((selectedLotConfig.dollarsPerPoint === 0 ? 0 : moveUpPerTradeProfit / selectedLotConfig.dollarsPerPoint).toFixed(2)),
    [moveUpPerTradeProfit, selectedLotConfig.dollarsPerPoint],
  );
  const winAmount65 = useMemo(() => Number((100 * 0.65 * moveUpPerTradeProfit).toFixed(2)), [moveUpPerTradeProfit]);
  const lossAmount35 = useMemo(() => Number((100 * 0.35 * moveDownPerTradeLoss).toFixed(2)), [moveDownPerTradeLoss]);
  const roiDollar = useMemo(() => Number((winAmount65 - lossAmount35).toFixed(2)), [lossAmount35, winAmount65]);
  const roiPercent = useMemo(
    () => Number((totalAmountNumber <= 0 ? 0 : (roiDollar / totalAmountNumber) * 100).toFixed(2)),
    [roiDollar, totalAmountNumber],
  );
  const toggleAnalysisSection = (section: keyof typeof analysisSectionOpen) => {
    setAnalysisSectionOpen((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    void (async () => {
      try {
        setIsAdmin(await getIsAdminFromSession());
      } catch {
        setIsAdmin(false);
      }
    })();
    void refresh(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTradingDayId) {
      setDayTrades([]);
      return;
    }

    void (async () => {
      try {
        const tradesRes = await apiCall<{ items: SessionTradeItem[] }>(`session-trades?dayId=${encodeURIComponent(selectedTradingDayId)}`);
        setDayTrades(tradesRes.items);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load trading day trades');
      }
    })();
  }, [selectedTradingDayId]);

  const loadData = async (windowDays = days) => {
    const [checksRes, checksTrendRes, confluencesRes, tradingDaysRes] = await Promise.all([
      apiCall<{ items: ChecklistItem[] }>(`checks?days=${windowDays}`),
      apiCall<TrendResponse>(`checks/trends?days=${windowDays}`),
      apiCall<ConfluenceResponse>('confluences'),
      apiCall<{ items: TradingDayItem[] }>(`trading-days?days=${windowDays}`),
    ]);

    setChecklistHistory(checksRes.items);
    setChecklistTrends(checksTrendRes);
    setConfluenceItems(confluencesRes.items);
    setBaseConfluences(confluencesRes.base);
    setCustomConfluences(confluencesRes.custom);
    setTradingDays(tradingDaysRes.items);
    setSelectedTradingDayId((previous) => {
      if (previous && tradingDaysRes.items.some((item) => item.id === previous)) {
        return previous;
      }

      return tradingDaysRes.items[0]?.id ?? null;
    });
  };

  const refresh = async (nextDays: number) => {
    setBusy(true);
    setError(null);

    try {
      setDays(nextDays);
      await loadData(nextDays);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard data');
    } finally {
      setBusy(false);
    }
  };

  const saveChecklist = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await apiCall<ChecklistItem>('checks', {
        method: 'POST',
        body: JSON.stringify(checklistForm),
      });
      setChecklistForm(defaultChecklistForm());
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save checklist');
    } finally {
      setBusy(false);
    }
  };

  const refreshTradingDayTrades = async (dayId: string) => {
    const tradesRes = await apiCall<{ items: SessionTradeItem[] }>(`session-trades?dayId=${encodeURIComponent(dayId)}`);
    setDayTrades(tradesRes.items);
  };

  const saveTradingDay = async (event: FormEvent) => {
    event.preventDefault();
    if (!tradingDayForm.tradingDate) {
      setError('Trading day date is required');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const created = await apiCall<TradingDayItem>('trading-days', {
        method: 'POST',
        body: JSON.stringify(tradingDayForm),
      });
      setTradingDayForm(defaultTradingDayForm());
      setTradingDayDialogOpen(false);
      await loadData();
      setSelectedTradingDayId(created.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save trading day');
    } finally {
      setBusy(false);
    }
  };

  const openCreateTradingDayDialog = () => {
    setTradingDayForm(defaultTradingDayForm());
    setTradingDayDialogOpen(true);
  };

  const deleteTradingDay = async (item: TradingDayItem) => {
    const confirmed = window.confirm('Delete this trading day and all its trades?');
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiCall<{ deleted: boolean }>(`trading-days?createdAt=${encodeURIComponent(item.createdAt)}&id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      await loadData();
      setSelectedTradingDayId((current) => (current === item.id ? null : current));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete trading day');
    } finally {
      setBusy(false);
    }
  };

  const openTradeDialog = (item?: SessionTradeItem) => {
    if (item) {
      const defaultForm = defaultTradeForm();
      setEditingSessionTrade({ id: item.id, createdAt: item.createdAt });
      setTradeForm({
        ...defaultForm,
        tradeDate: item.tradeDate,
        tradeTime: item.tradeTime ?? '',
        sessionName: item.sessionName ?? '',
        pair: item.pair ?? 'XAUUSD',
        fundamentalsSentiment: item.fundamentalsSentiment ?? defaultForm.fundamentalsSentiment,
        movingAverages5m: item.movingAverages5m ?? defaultForm.movingAverages5m,
        patternsTrend5m: item.patternsTrend5m ?? defaultForm.patternsTrend5m,
        movingAverages1h: item.movingAverages1h ?? defaultForm.movingAverages1h,
        patternsTrend1h: item.patternsTrend1h ?? defaultForm.patternsTrend1h,
        relativeStrength5m: item.relativeStrength5m ?? defaultForm.relativeStrength5m,
        relativeStrength1h: item.relativeStrength1h ?? defaultForm.relativeStrength1h,
        candle1h: item.candle1h ?? defaultForm.candle1h,
        candle4h: item.candle4h ?? defaultForm.candle4h,
        candleDaily: item.candleDaily ?? defaultForm.candleDaily,
        candleWeekly: item.candleWeekly ?? defaultForm.candleWeekly,
        candleMonthly: item.candleMonthly ?? defaultForm.candleMonthly,
        analysisConclusion: item.analysisConclusion ?? 'bullish',
        prevDayLow: item.prevDayLow ?? '',
        prevDayHigh: item.prevDayHigh ?? '',
        currentDayLow: item.currentDayLow ?? '',
        currentDayHigh: item.currentDayHigh ?? '',
        currentTrend: item.currentTrend ?? 'bullish',
        directionalBias: item.directionalBias ?? 'bullish',
        tradingStyle: item.tradingStyle ?? 'trend',
        futuresPrice: item.futuresPrice ?? '',
        priceActionNotes: item.priceActionNotes ?? '',
        redFolderNews: item.redFolderNews ?? false,
        newsImpact: item.newsImpact ?? 'high',
        newsTime: item.newsTime ?? '',
        newsNotes: item.newsNotes ?? '',
        sellRsiLevel: item.sellRsiLevel ?? '',
        buyRsiLevel: item.buyRsiLevel ?? '',
        hasClearTrend: item.hasClearTrend ?? true,
        tradingNotes: item.tradingNotes ?? '',
        sellZone1: item.sellZone1 ?? '',
        sellZone2: item.sellZone2 ?? '',
        sellZone3: item.sellZone3 ?? '',
        buyZone1: item.buyZone1 ?? '',
        buyZone2: item.buyZone2 ?? '',
        buyZone3: item.buyZone3 ?? '',
        reversalZone1: item.reversalZone1 ?? '',
        reversalZone2: item.reversalZone2 ?? '',
        swingZone1: item.swingZone1 ?? '',
        swingZone2: item.swingZone2 ?? '',
        marketStructure: item.marketStructure && item.marketStructure.length > 0 ? item.marketStructure : defaultForm.marketStructure,
        tradingAsset: item.tradingAsset,
        tradeSide: item.tradeSide ?? 'buy',
        strategy: item.strategy,
        confluences: item.confluences && item.confluences.length > 0 ? item.confluences : [''],
        entryPrice: toInputString(item.entryPrice),
        riskRewardRatio: toInputString(item.riskRewardRatio),
        stopLossPrice: toInputString(item.stopLossPrice),
        takeProfitPrice: toInputString(item.takeProfitPrice),
        exitPrice: toInputString(item.exitPrice),
        feelings: item.feelings as TradeLogFormState['feelings'] ?? 'Not filled',
        comments: item.comments ?? '',
        chartLink: item.chartLink ?? '',
      });
    } else {
      setEditingSessionTrade(null);
      setTradeForm({
        ...defaultTradeForm(),
        tradeDate: selectedTradingDay?.tradingDate ?? defaultTradeForm().tradeDate,
      });
    }
    setTradeDialogOpen(true);
  };

  const closeTradeDialog = () => {
    setTradeDialogOpen(false);
    setEditingSessionTrade(null);
    setTradeForm(defaultTradeForm());
  };

  const saveSessionTrade = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTradingDayId) {
      setError('Select a trading day first');
      return;
    }

    const payload = {
      dayId: selectedTradingDayId,
      sessionId: selectedTradingDayId,
      tradeDate: tradeForm.tradeDate,
      tradeTime: tradeForm.tradeTime,
      sessionName: tradeForm.sessionName,
      pair: tradeForm.pair,
      fundamentalsSentiment: tradeForm.fundamentalsSentiment,
      movingAverages5m: tradeForm.movingAverages5m,
      patternsTrend5m: tradeForm.patternsTrend5m,
      movingAverages1h: tradeForm.movingAverages1h,
      patternsTrend1h: tradeForm.patternsTrend1h,
      relativeStrength5m: tradeForm.relativeStrength5m,
      relativeStrength1h: tradeForm.relativeStrength1h,
      candle1h: tradeForm.candle1h,
      candle4h: tradeForm.candle4h,
      candleDaily: tradeForm.candleDaily,
      candleWeekly: tradeForm.candleWeekly,
      candleMonthly: tradeForm.candleMonthly,
      analysisConclusion: tradeForm.analysisConclusion,
      prevDayLow: tradeForm.prevDayLow,
      prevDayHigh: tradeForm.prevDayHigh,
      currentDayLow: tradeForm.currentDayLow,
      currentDayHigh: tradeForm.currentDayHigh,
      currentTrend: tradeForm.currentTrend,
      directionalBias: tradeForm.directionalBias,
      tradingStyle: tradeForm.tradingStyle,
      futuresPrice: tradeForm.futuresPrice,
      priceActionNotes: tradeForm.priceActionNotes,
      redFolderNews: tradeForm.redFolderNews,
      newsImpact: tradeForm.newsImpact,
      newsTime: tradeForm.newsTime,
      newsNotes: tradeForm.newsNotes,
      sellRsiLevel: tradeForm.sellRsiLevel,
      buyRsiLevel: tradeForm.buyRsiLevel,
      hasClearTrend: tradeForm.hasClearTrend,
      tradingNotes: tradeForm.tradingNotes,
      sellZone1: tradeForm.sellZone1,
      sellZone2: tradeForm.sellZone2,
      sellZone3: tradeForm.sellZone3,
      buyZone1: tradeForm.buyZone1,
      buyZone2: tradeForm.buyZone2,
      buyZone3: tradeForm.buyZone3,
      reversalZone1: tradeForm.reversalZone1,
      reversalZone2: tradeForm.reversalZone2,
      swingZone1: tradeForm.swingZone1,
      swingZone2: tradeForm.swingZone2,
      marketStructure: tradeForm.marketStructure,
      tradingAsset: tradeForm.tradingAsset,
      tradeSide: tradeForm.tradeSide,
      strategy: tradeForm.strategy,
      confluences: tradeForm.confluences.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
      entryPrice: entryPriceValue,
      riskRewardRatio: toNumberOrUndefined(tradeForm.riskRewardRatio),
      stopLossPrice: stopLossPriceValue,
      takeProfitPrice: takeProfitPriceValue,
      estimatedLoss: estimatedLossValue,
      estimatedProfit: estimatedProfitValue,
      exitPrice: exitPriceValue,
      totalProfit: tradeProfitValue,
      feelings: tradeForm.feelings,
      comments: tradeForm.comments,
      chartLink: tradeForm.chartLink,
    };

    setBusy(true);
    setError(null);
    try {
      if (editingSessionTrade) {
        await apiCall<SessionTradeItem>(`session-trades?createdAt=${encodeURIComponent(editingSessionTrade.createdAt)}&id=${encodeURIComponent(editingSessionTrade.id)}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        await apiCall<SessionTradeItem>('session-trades', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      if (selectedTradingDayId) {
        await refreshTradingDayTrades(selectedTradingDayId);
      }
      closeTradeDialog();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save trade');
    } finally {
      setBusy(false);
    }
  };

  const deleteSessionTrade = async () => {
    if (!editingSessionTrade) {
      return;
    }

    const confirmed = window.confirm('Delete this trade?');
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiCall<{ deleted: boolean }>(`session-trades?createdAt=${encodeURIComponent(editingSessionTrade.createdAt)}&id=${encodeURIComponent(editingSessionTrade.id)}`, {
        method: 'DELETE',
      });
      if (selectedTradingDayId) {
        await refreshTradingDayTrades(selectedTradingDayId);
      }
      closeTradeDialog();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete trade');
    } finally {
      setBusy(false);
    }
  };

  const saveConfluence = async (event: FormEvent) => {
    event.preventDefault();
    const name = newConfluence.trim();
    if (name.length < 2) {
      setError('Confluence must be at least 2 characters');
      return;
    }

    const alreadyExists = confluenceSuggestions.some((item) => item.toLowerCase() === name.toLowerCase());
    if (alreadyExists) {
      setError('Confluence already exists');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiCall<ConfluenceItem>('confluences', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setNewConfluence('');
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save confluence');
    } finally {
      setBusy(false);
    }
  };

  const deleteConfluence = async (item: ConfluenceItem) => {
    if (item.isBase) {
      return;
    }

    const confirmed = window.confirm('Delete this custom confluence?');
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiCall<{ deleted: boolean }>(`confluences?createdAt=${encodeURIComponent(item.createdAt)}&id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete confluence');
    } finally {
      setBusy(false);
    }
  };

  const beginEditConfluence = (scope: 'custom' | 'base', item: ConfluenceItem) => {
    setEditingConfluenceKey(`${scope}:${item.id}:${item.createdAt}`);
    setEditingConfluenceValue(item.name);
  };

  const cancelEditConfluence = () => {
    setEditingConfluenceKey(null);
    setEditingConfluenceValue('');
  };

  const updateConfluence = async (item: ConfluenceItem) => {
    const name = editingConfluenceValue.trim();
    if (name.length < 2) {
      setError('Confluence must be at least 2 characters');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiCall<{ updated: boolean }>(`confluences?createdAt=${encodeURIComponent(item.createdAt)}&id=${encodeURIComponent(item.id)}`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      cancelEditConfluence();
      await loadData();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update confluence');
    } finally {
      setBusy(false);
    }
  };

  const saveBaseConfluence = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAdmin) {
      return;
    }

    const name = newBaseConfluence.trim();
    if (name.length < 2) {
      setError('Base confluence must be at least 2 characters');
      return;
    }

    const alreadyExists = confluenceSuggestions.some((item) => item.toLowerCase() === name.toLowerCase());
    if (alreadyExists) {
      setError('Confluence already exists');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiCall<ConfluenceItem>('confluences/base', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setNewBaseConfluence('');
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save base confluence');
    } finally {
      setBusy(false);
    }
  };

  const deleteBaseConfluence = async (item: ConfluenceItem) => {
    if (!isAdmin || !item.isBase || !item.createdAt) {
      return;
    }

    const confirmed = window.confirm('Delete this base confluence for all users?');
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiCall<{ deleted: boolean }>(`confluences/base?createdAt=${encodeURIComponent(item.createdAt)}&id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete base confluence');
    } finally {
      setBusy(false);
    }
  };

  const updateBaseConfluence = async (item: ConfluenceItem) => {
    if (!isAdmin || !item.createdAt) {
      return;
    }

    const name = editingConfluenceValue.trim();
    if (name.length < 2) {
      setError('Base confluence must be at least 2 characters');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiCall<{ updated: boolean }>(`confluences/base?createdAt=${encodeURIComponent(item.createdAt)}&id=${encodeURIComponent(item.id)}`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      cancelEditConfluence();
      await loadData();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update base confluence');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <header className="header-shell">
        <div className="header-top">
          <h1>Trading Tracker</h1>
          <div className="hero-actions">
            <span>{email}</span>
            <button onClick={() => void refresh(days)} disabled={busy}>Refresh</button>
            <button className="ghost" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
        <nav className="menu-tabs" aria-label="Dashboard sections">
          <button className={activeTab === 'checklist' ? 'tab active' : 'tab'} onClick={() => setActiveTab('checklist')}>Checklist</button>
          <button className={activeTab === 'tradeCalc' ? 'tab active' : 'tab'} onClick={() => setActiveTab('tradeCalc')}>Trade Calc</button>
          <button className={activeTab === 'trades' ? 'tab active' : 'tab'} onClick={() => setActiveTab('trades')}>Trading Days</button>
          <button className={activeTab === 'confluences' ? 'tab active' : 'tab'} onClick={() => setActiveTab('confluences')}>Confluences</button>
          <label className="window-select">
            Window
            <select value={days} onChange={(event) => void refresh(Number(event.target.value))} disabled={busy}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
        </nav>
      </header>

      {activeTab === 'checklist' && (
        <section className="content-grid">
          <article className="panel">
            <h2>Capture Checklist</h2>
            <form onSubmit={saveChecklist} className="checklist-form">
              <label>
                Date
                <input
                  type="date"
                  value={checklistForm.tradingDate}
                  onChange={(event) => setChecklistForm((prev) => ({ ...prev, tradingDate: event.target.value }))}
                  required
                />
              </label>

              <label>
                Session
                <select
                  value={checklistForm.sessionName}
                  onChange={(event) => setChecklistForm((prev) => ({ ...prev, sessionName: event.target.value }))}
                >
                  <option>London Open</option>
                  <option>New York Open</option>
                  <option>Asia Session</option>
                  <option>Custom</option>
                </select>
              </label>

              <fieldset>
                <legend>Self Evaluation</legend>
                {checklistLabels.filter((item) => item.kind === 'question').map((item) => (
                  <div key={item.key} className="choice-row">
                    <span>{item.label}</span>
                    <div className="toggle-group">
                      <button type="button" className={checklistForm[item.key] ? 'active' : ''} onClick={() => setChecklistForm((prev) => ({ ...prev, [item.key]: true }))}>Yes</button>
                      <button type="button" className={!checklistForm[item.key] ? 'active' : ''} onClick={() => setChecklistForm((prev) => ({ ...prev, [item.key]: false }))}>No</button>
                    </div>
                  </div>
                ))}
              </fieldset>

              <fieldset>
                <legend>Commitments</legend>
                {checklistLabels.filter((item) => item.kind === 'commitment').map((item) => (
                  <label className="checkbox-row" key={item.key}>
                    <input
                      type="checkbox"
                      checked={checklistForm[item.key]}
                      onChange={(event) => setChecklistForm((prev) => ({ ...prev, [item.key]: event.target.checked }))}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </fieldset>

              <label>
                Signature
                <input
                  type="text"
                  value={checklistForm.signature}
                  onChange={(event) => setChecklistForm((prev) => ({ ...prev, signature: event.target.value }))}
                  required
                />
              </label>

              <label>
                Notes
                <textarea rows={3} value={checklistForm.notes} onChange={(event) => setChecklistForm((prev) => ({ ...prev, notes: event.target.value }))} />
              </label>

              <div className="form-footer">
                <span>Readiness score preview: {checklistPreview}%</span>
                <button type="submit" disabled={busy}>Save Checklist</button>
              </div>
            </form>
          </article>

          <article className="panel">
            <h2>Checklist Trends</h2>
            {checklistTrends ? (
              <>
                <div className="stats-grid">
                  <div className="stat-card"><p>Total Captures</p><h3>{checklistTrends.totalCaptures}</h3></div>
                  <div className="stat-card"><p>Average Score</p><h3>{checklistTrends.averageScore}%</h3></div>
                  <div className="stat-card"><p>Environment Ready</p><h3>{checklistTrends.readinessRates.environmentReady ?? 0}%</h3></div>
                </div>
                <h3 className="section-title">Daily Score Trend</h3>
                <div className="trend-bars">
                  {checklistTrends.dailyScores.map((item) => (
                    <div key={item.date} className="trend-bar-row">
                      <span>{item.date}</span>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${item.averageScore}%` }} /></div>
                      <span>{item.averageScore}%</span>
                    </div>
                  ))}
                </div>
                <h3 className="section-title">Recent Captures</h3>
                <div className="history-table-wrapper">
                  <table className="history-table">
                    <thead><tr><th>Date</th><th>Session</th><th>Score</th><th>Signature</th></tr></thead>
                    <tbody>
                      {checklistHistory.map((item) => (
                        <tr key={item.id}><td>{item.tradingDate}</td><td>{item.sessionName ?? '-'}</td><td>{item.score}%</td><td>{item.signature}</td></tr>
                      ))}
                      {checklistHistory.length === 0 && <tr><td colSpan={4}>No entries in this period.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <p>Load data to view trends.</p>}
          </article>
        </section>
      )}

      {activeTab === 'tradeCalc' && (
        <section className="panel trade-calc-panel">
          <h2>Trading Loss Calculator</h2>

          <fieldset>
            <legend>Lot Sizes to Dollars</legend>
            <div className="lot-radio-grid">
              {lotSizeOptions.map((option) => (
                <label key={option.lotSize} className="lot-radio">
                  <input
                    type="radio"
                    name="lot-size"
                    value={option.lotSize}
                    checked={selectedLotSize === option.lotSize}
                    onChange={() => setSelectedLotSize(option.lotSize)}
                  />
                  <span>{option.lotSize}{' -> '}${option.dollarsPerPoint.toLocaleString()}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid-3">
            <label>
              Total Amount Willing to Lose
              <input
                type="number"
                step="0.01"
                value={totalAmountToLose}
                onChange={(event) => setTotalAmountToLose(event.target.value)}
                placeholder="Enter total amount"
              />
            </label>
            <label>
              Divided by 100 Trades
              <input readOnly value={Number.isFinite(dividedBy100Trades) ? dividedBy100Trades : ''} />
            </label>
            <label>
              1:R Ratio
              <input
                type="number"
                min="0"
                step="0.01"
                value={riskRewardRatioCalc}
                onChange={(event) => setRiskRewardRatioCalc(event.target.value)}
              />
            </label>
          </div>

          <div className="grid-3">
            <label>
              $ Move DOWN Per Trade (Loss)
              <input readOnly value={moveDownPerTradeLoss} />
            </label>
            <label>
              $ Move UP Per Trade (Profit)
              <input readOnly value={moveUpPerTradeProfit} />
            </label>
          </div>

          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Absolute SL DOWN</th>
                  <th>UPSIDE Profit</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{absoluteSlDown}</td>
                  <td>{upsideProfit}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="section-title">Over 100 trades</h3>
          <div className="stats-grid trade-calc-stats">
            <div className="stat-card"><p>65% Win Amount</p><h3>${winAmount65.toLocaleString()}</h3></div>
            <div className="stat-card"><p>35% Loss Amount</p><h3>${lossAmount35.toLocaleString()}</h3></div>
            <div className="stat-card"><p>ROI ($)</p><h3>${roiDollar.toLocaleString()}</h3></div>
            <div className="stat-card"><p>ROI (%)</p><h3>{roiPercent}%</h3></div>
          </div>
        </section>
      )}

      {activeTab === 'trades' && (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2>Trading Days</h2>
              <button type="button" className="icon-button add-icon-button" onClick={openCreateTradingDayDialog} title="Add trading day" aria-label="Add trading day">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M11 5h2v14h-2zM5 11h14v2H5z" fill="currentColor" /></svg>
              </button>
            </div>
            <div className="grid-3">
              <label>Year
                <select value={tradingDayYearFilter} onChange={(event) => setTradingDayYearFilter(event.target.value)}>
                  <option value="all">All years</option>
                  {tradingDayYears.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <label>Month
                <select value={tradingDayMonthFilter} onChange={(event) => setTradingDayMonthFilter(event.target.value)}>
                  <option value="all">All months</option>
                  {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((month) => (
                    <option key={month} value={month}>{month}</option>
                  ))}
                </select>
              </label>
              <label>Search
                <input value={tradingDaySearch} onChange={(event) => setTradingDaySearch(event.target.value)} placeholder="Date or title" />
              </label>
            </div>
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead><tr><th>Date</th><th>Title</th><th /></tr></thead>
                <tbody>
                  {filteredTradingDays.map((item) => (
                    <tr key={item.id} className={selectedTradingDayId === item.id ? 'selected-row' : ''}>
                      <td>{item.tradingDate}</td>
                      <td>{item.title || '-'}</td>
                      <td>
                        <div className="inline-actions">
                          <button type="button" className={selectedTradingDayId === item.id ? '' : 'ghost'} onClick={() => setSelectedTradingDayId(item.id)}>
                            {selectedTradingDayId === item.id ? 'Selected' : 'Open'}
                          </button>
                          <button type="button" className="icon-button" onClick={() => void deleteTradingDay(item)} title="Delete trading day" aria-label="Delete trading day">
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" fill="currentColor" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredTradingDays.length === 0 && <tr><td colSpan={3}>No trading days found.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {selectedTradingDay && (
            <section className="panel">
              <h2>Trading Day: {selectedTradingDay.tradingDate}</h2>
              <p className="subtitle">{selectedTradingDay.title || 'No title'}{selectedTradingDay.notes ? ` | ${selectedTradingDay.notes}` : ''}</p>

              <article className="confluence-manage-card">
                <div className="panel-header">
                  <h3>Trades</h3>
                  <button type="button" className="icon-button add-icon-button" onClick={() => openTradeDialog()} title="Add trade" aria-label="Add trade">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M11 5h2v14h-2zM5 11h14v2H5z" fill="currentColor" /></svg>
                  </button>
                </div>
                <div className="history-table-wrapper">
                  <table className="history-table">
                    <thead><tr><th>Date</th><th>Time</th><th>Pair</th><th>Asset</th><th>Side</th><th>Conclusion</th><th>Profit</th><th>Chart</th><th /></tr></thead>
                    <tbody>
                      {dayTrades.map((trade) => (
                        <tr key={trade.id}>
                          <td>{trade.tradeDate}</td>
                          <td>{trade.tradeTime ?? '-'}</td>
                          <td>{trade.pair ?? '-'}</td>
                          <td>{trade.tradingAsset}</td>
                          <td>{trade.tradeSide ?? '-'}</td>
                          <td>{trade.analysisConclusion ?? '-'}</td>
                          <td>{trade.totalProfit ?? '-'}</td>
                          <td>{trade.chartLink ? <a href={trade.chartLink} target="_blank" rel="noreferrer">Open link</a> : '-'}</td>
                          <td><button type="button" className="ghost" onClick={() => openTradeDialog(trade)}>View / Edit</button></td>
                        </tr>
                      ))}
                      {dayTrades.length === 0 && <tr><td colSpan={9}>No trades yet for this day.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          )}
        </>
      )}
      {tradeDialogOpen && (
            <div className="dialog-backdrop" role="dialog" aria-modal="true">
              <div className="dialog-card">
                <div className="panel-header">
                  <h3>{editingSessionTrade ? 'Manage Trade' : 'Create Trade'}</h3>
                  <button type="button" className="ghost" onClick={closeTradeDialog}>Close</button>
                </div>
                <form className="market-form" onSubmit={saveSessionTrade}>
                  <fieldset>
                    <legend>Market Analysis</legend>
                    <div className="grid-3">
                      <label>Pair<input value={tradeForm.pair} onChange={(event) => setTradeForm((prev) => ({ ...prev, pair: event.target.value }))} /></label>
                      <label>Date<input type="date" value={tradeForm.tradeDate} onChange={(event) => setTradeForm((prev) => ({ ...prev, tradeDate: event.target.value }))} /></label>
                      <label>Session<select value={tradeForm.sessionName} onChange={(event) => setTradeForm((prev) => ({ ...prev, sessionName: event.target.value }))}><option>London Open</option><option>New York Open</option><option>Asia Session</option><option>Custom</option></select></label>
                    </div>
                    <div className="analysis-pdf-stack">
                      <section className="analysis-pdf-section">
                        <div className="collapsible-header">
                          <h4>Pre-Market Checklist</h4>
                          <button
                            type="button"
                            className="icon-button collapse-icon-button"
                            onClick={() => toggleAnalysisSection('preMarket')}
                            aria-label={analysisSectionOpen.preMarket ? 'Collapse pre-market checklist' : 'Expand pre-market checklist'}
                            title={analysisSectionOpen.preMarket ? 'Collapse' : 'Expand'}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                              {analysisSectionOpen.preMarket ? <path d="M7 14l5-5 5 5z" fill="currentColor" /> : <path d="M7 10l5 5 5-5z" fill="currentColor" />}
                            </svg>
                          </button>
                        </div>
                        {analysisSectionOpen.preMarket && (
                          <>
                            <div className="analysis-choice-grid">
                              {preMarketChecklistFields.map((field) => (
                                <div key={field.key} className="analysis-choice-row">
                                  <span>{field.label}</span>
                                  <div className="choice-box-group">
                                    {directionOptions.map((option) => (
                                      <label key={`${field.key}-${option.value}`} className="choice-box">
                                        <input
                                          type="radio"
                                          name={`trade-${field.key}`}
                                          checked={tradeForm[field.key] === option.value}
                                          onChange={() => setTradeForm((prev) => ({ ...prev, [field.key]: option.value }))}
                                        />
                                        <span>{option.label}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <label>Conclusion
                              <select value={tradeForm.analysisConclusion} onChange={(event) => setTradeForm((prev) => ({ ...prev, analysisConclusion: event.target.value as TradeLogFormState['analysisConclusion'] }))}>
                                <option value="bullish">Bullish</option>
                                <option value="bearish">Bearish</option>
                                <option value="consolidation">Consolidation</option>
                                <option value="bearishConsolidation">Bearish Consolidation</option>
                                <option value="bullishConsolidation">Bullish Consolidation</option>
                              </select>
                            </label>
                          </>
                        )}
                      </section>

                      <section className="analysis-pdf-section">
                        <div className="collapsible-header">
                          <h4>Price Action</h4>
                          <button
                            type="button"
                            className="icon-button collapse-icon-button"
                            onClick={() => toggleAnalysisSection('priceAction')}
                            aria-label={analysisSectionOpen.priceAction ? 'Collapse price action' : 'Expand price action'}
                            title={analysisSectionOpen.priceAction ? 'Collapse' : 'Expand'}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                              {analysisSectionOpen.priceAction ? <path d="M7 14l5-5 5 5z" fill="currentColor" /> : <path d="M7 10l5 5 5-5z" fill="currentColor" />}
                            </svg>
                          </button>
                        </div>
                        {analysisSectionOpen.priceAction && (
                          <>
                            <div className="grid-3">
                              <label>Prev day low<input value={tradeForm.prevDayLow} onChange={(event) => setTradeForm((prev) => ({ ...prev, prevDayLow: event.target.value }))} /></label>
                              <label>Prev day high<input value={tradeForm.prevDayHigh} onChange={(event) => setTradeForm((prev) => ({ ...prev, prevDayHigh: event.target.value }))} /></label>
                              <label>Futures price<input value={tradeForm.futuresPrice} onChange={(event) => setTradeForm((prev) => ({ ...prev, futuresPrice: event.target.value }))} /></label>
                              <label>Current day low<input value={tradeForm.currentDayLow} onChange={(event) => setTradeForm((prev) => ({ ...prev, currentDayLow: event.target.value }))} /></label>
                              <label>Current day high<input value={tradeForm.currentDayHigh} onChange={(event) => setTradeForm((prev) => ({ ...prev, currentDayHigh: event.target.value }))} /></label>
                            </div>
                            <label>Price action notes<textarea rows={2} value={tradeForm.priceActionNotes} onChange={(event) => setTradeForm((prev) => ({ ...prev, priceActionNotes: event.target.value }))} /></label>
                          </>
                        )}
                      </section>

                      <section className="analysis-pdf-section">
                        <div className="collapsible-header">
                          <h4>News Notes (GMT+2)</h4>
                          <button
                            type="button"
                            className="icon-button collapse-icon-button"
                            onClick={() => toggleAnalysisSection('newsNotes')}
                            aria-label={analysisSectionOpen.newsNotes ? 'Collapse news notes' : 'Expand news notes'}
                            title={analysisSectionOpen.newsNotes ? 'Collapse' : 'Expand'}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                              {analysisSectionOpen.newsNotes ? <path d="M7 14l5-5 5 5z" fill="currentColor" /> : <path d="M7 10l5 5 5-5z" fill="currentColor" />}
                            </svg>
                          </button>
                        </div>
                        {analysisSectionOpen.newsNotes && (
                          <>
                            <div className="grid-3">
                              <div className="radio-inline">
                                <span>Red folder news</span>
                                <label><input type="radio" name="redFolderNews" checked={tradeForm.redFolderNews} onChange={() => setTradeForm((prev) => ({ ...prev, redFolderNews: true }))} /> Yes</label>
                                <label><input type="radio" name="redFolderNews" checked={!tradeForm.redFolderNews} onChange={() => setTradeForm((prev) => ({ ...prev, redFolderNews: false }))} /> No</label>
                              </div>
                              <div className="radio-inline">
                                <span>Impact</span>
                                <label><input type="radio" name="newsImpact" checked={tradeForm.newsImpact === 'high'} onChange={() => setTradeForm((prev) => ({ ...prev, newsImpact: 'high' }))} /> High</label>
                                <label><input type="radio" name="newsImpact" checked={tradeForm.newsImpact === 'low'} onChange={() => setTradeForm((prev) => ({ ...prev, newsImpact: 'low' }))} /> Low</label>
                              </div>
                              <label>News time<input value={tradeForm.newsTime} onChange={(event) => setTradeForm((prev) => ({ ...prev, newsTime: event.target.value }))} /></label>
                            </div>
                            <label>News notes<textarea rows={2} value={tradeForm.newsNotes} onChange={(event) => setTradeForm((prev) => ({ ...prev, newsNotes: event.target.value }))} /></label>
                          </>
                        )}
                      </section>

                      <section className="analysis-pdf-section">
                        <div className="collapsible-header">
                          <h4>Pull Back Trading Levels</h4>
                          <button
                            type="button"
                            className="icon-button collapse-icon-button"
                            onClick={() => toggleAnalysisSection('pullBackLevels')}
                            aria-label={analysisSectionOpen.pullBackLevels ? 'Collapse pull back levels' : 'Expand pull back levels'}
                            title={analysisSectionOpen.pullBackLevels ? 'Collapse' : 'Expand'}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                              {analysisSectionOpen.pullBackLevels ? <path d="M7 14l5-5 5 5z" fill="currentColor" /> : <path d="M7 10l5 5 5-5z" fill="currentColor" />}
                            </svg>
                          </button>
                        </div>
                        {analysisSectionOpen.pullBackLevels && (
                          <div className="grid-3">
                            <label>Sell RSI level (overbought)<input value={tradeForm.sellRsiLevel} onChange={(event) => setTradeForm((prev) => ({ ...prev, sellRsiLevel: event.target.value }))} /></label>
                            <label>Buy RSI level (oversold)<input value={tradeForm.buyRsiLevel} onChange={(event) => setTradeForm((prev) => ({ ...prev, buyRsiLevel: event.target.value }))} /></label>
                          </div>
                        )}
                      </section>

                      <section className="analysis-pdf-section">
                        <div className="collapsible-header">
                          <h4>Trading Notes</h4>
                          <button
                            type="button"
                            className="icon-button collapse-icon-button"
                            onClick={() => toggleAnalysisSection('tradingNotes')}
                            aria-label={analysisSectionOpen.tradingNotes ? 'Collapse trading notes' : 'Expand trading notes'}
                            title={analysisSectionOpen.tradingNotes ? 'Collapse' : 'Expand'}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                              {analysisSectionOpen.tradingNotes ? <path d="M7 14l5-5 5 5z" fill="currentColor" /> : <path d="M7 10l5 5 5-5z" fill="currentColor" />}
                            </svg>
                          </button>
                        </div>
                        {analysisSectionOpen.tradingNotes && (
                          <>
                            <div className="grid-3">
                              <div className="radio-inline">
                                <span>Has a clear trend</span>
                                <label><input type="radio" name="hasClearTrend" checked={tradeForm.hasClearTrend} onChange={() => setTradeForm((prev) => ({ ...prev, hasClearTrend: true }))} /> Yes</label>
                                <label><input type="radio" name="hasClearTrend" checked={!tradeForm.hasClearTrend} onChange={() => setTradeForm((prev) => ({ ...prev, hasClearTrend: false }))} /> No</label>
                              </div>
                              <label>Current trend
                                <select value={tradeForm.currentTrend} onChange={(event) => setTradeForm((prev) => ({ ...prev, currentTrend: event.target.value as TradeLogFormState['currentTrend'] }))}>
                                  <option value="bullish">Bullish</option>
                                  <option value="bearish">Bearish</option>
                                  <option value="consolidation">Consolidation</option>
                                  <option value="none">None</option>
                                </select>
                              </label>
                              <label>Directional bias
                                <select value={tradeForm.directionalBias} onChange={(event) => setTradeForm((prev) => ({ ...prev, directionalBias: event.target.value as TradeLogFormState['directionalBias'] }))}>
                                  <option value="bullish">Bullish</option>
                                  <option value="bearish">Bearish</option>
                                  <option value="none">None</option>
                                </select>
                              </label>
                              <label>Trading style
                                <select value={tradeForm.tradingStyle} onChange={(event) => setTradeForm((prev) => ({ ...prev, tradingStyle: event.target.value as TradeLogFormState['tradingStyle'] }))}>
                                  <option value="trend">Trend</option>
                                  <option value="consolidation">Consolidation</option>
                                </select>
                              </label>
                            </div>
                            <label>Trading notes<textarea rows={2} value={tradeForm.tradingNotes} onChange={(event) => setTradeForm((prev) => ({ ...prev, tradingNotes: event.target.value }))} /></label>
                          </>
                        )}
                      </section>

                      <section className="analysis-pdf-section">
                        <div className="collapsible-header">
                          <h4>Potential Zones</h4>
                          <button
                            type="button"
                            className="icon-button collapse-icon-button"
                            onClick={() => toggleAnalysisSection('potentialZones')}
                            aria-label={analysisSectionOpen.potentialZones ? 'Collapse potential zones' : 'Expand potential zones'}
                            title={analysisSectionOpen.potentialZones ? 'Collapse' : 'Expand'}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                              {analysisSectionOpen.potentialZones ? <path d="M7 14l5-5 5 5z" fill="currentColor" /> : <path d="M7 10l5 5 5-5z" fill="currentColor" />}
                            </svg>
                          </button>
                        </div>
                        {analysisSectionOpen.potentialZones && (
                          <>
                            <div className="grid-3">
                              <label>Potential sell zone 1<input value={tradeForm.sellZone1} onChange={(event) => setTradeForm((prev) => ({ ...prev, sellZone1: event.target.value }))} /></label>
                              <label>Potential sell zone 2<input value={tradeForm.sellZone2} onChange={(event) => setTradeForm((prev) => ({ ...prev, sellZone2: event.target.value }))} /></label>
                              <label>Potential sell zone 3<input value={tradeForm.sellZone3} onChange={(event) => setTradeForm((prev) => ({ ...prev, sellZone3: event.target.value }))} /></label>
                            </div>
                            <div className="grid-3">
                              <label>Potential buy zone 1<input value={tradeForm.buyZone1} onChange={(event) => setTradeForm((prev) => ({ ...prev, buyZone1: event.target.value }))} /></label>
                              <label>Potential buy zone 2<input value={tradeForm.buyZone2} onChange={(event) => setTradeForm((prev) => ({ ...prev, buyZone2: event.target.value }))} /></label>
                              <label>Potential buy zone 3<input value={tradeForm.buyZone3} onChange={(event) => setTradeForm((prev) => ({ ...prev, buyZone3: event.target.value }))} /></label>
                            </div>
                            <div className="grid-3">
                              <label>Potential reversal zone 1<input value={tradeForm.reversalZone1} onChange={(event) => setTradeForm((prev) => ({ ...prev, reversalZone1: event.target.value }))} /></label>
                              <label>Potential reversal zone 2<input value={tradeForm.reversalZone2} onChange={(event) => setTradeForm((prev) => ({ ...prev, reversalZone2: event.target.value }))} /></label>
                            </div>
                            <div className="grid-3">
                              <label>Potential swing zone 1<input value={tradeForm.swingZone1} onChange={(event) => setTradeForm((prev) => ({ ...prev, swingZone1: event.target.value }))} /></label>
                              <label>Potential swing zone 2<input value={tradeForm.swingZone2} onChange={(event) => setTradeForm((prev) => ({ ...prev, swingZone2: event.target.value }))} /></label>
                            </div>
                          </>
                        )}
                      </section>

                      <section className="analysis-pdf-section">
                        <div className="collapsible-header">
                          <h4>Market Structure</h4>
                          <button
                            type="button"
                            className="icon-button collapse-icon-button"
                            onClick={() => toggleAnalysisSection('marketStructure')}
                            aria-label={analysisSectionOpen.marketStructure ? 'Collapse market structure' : 'Expand market structure'}
                            title={analysisSectionOpen.marketStructure ? 'Collapse' : 'Expand'}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                              {analysisSectionOpen.marketStructure ? <path d="M7 14l5-5 5 5z" fill="currentColor" /> : <path d="M7 10l5 5 5-5z" fill="currentColor" />}
                            </svg>
                          </button>
                        </div>
                        {analysisSectionOpen.marketStructure && (
                          <div className="market-structure-grid">
                            {tradeForm.marketStructure.map((row, index) => (
                              <div key={`${row.rangeName}-${index}`} className="market-structure-row">
                                <span>{row.rangeName}</span>
                                <div className="radio-inline compact">
                                  <label>
                                    <input
                                      type="radio"
                                      name={`market-structure-${index}`}
                                      checked={row.bias === 'buy'}
                                      onChange={() => setTradeForm((prev) => ({
                                        ...prev,
                                        marketStructure: prev.marketStructure.map((entry, entryIndex) => (
                                          entryIndex === index ? { ...entry, bias: 'buy' } : entry
                                        )),
                                      }))}
                                    />
                                    Buy
                                  </label>
                                  <label>
                                    <input
                                      type="radio"
                                      name={`market-structure-${index}`}
                                      checked={row.bias === 'sell'}
                                      onChange={() => setTradeForm((prev) => ({
                                        ...prev,
                                        marketStructure: prev.marketStructure.map((entry, entryIndex) => (
                                          entryIndex === index ? { ...entry, bias: 'sell' } : entry
                                        )),
                                      }))}
                                    />
                                    Sell
                                  </label>
                                  <label>
                                    <input
                                      type="radio"
                                      name={`market-structure-${index}`}
                                      checked={row.bias === 'none'}
                                      onChange={() => setTradeForm((prev) => ({
                                        ...prev,
                                        marketStructure: prev.marketStructure.map((entry, entryIndex) => (
                                          entryIndex === index ? { ...entry, bias: 'none' } : entry
                                        )),
                                      }))}
                                    />
                                    None
                                  </label>
                                </div>
                                <input
                                  placeholder="Level"
                                  value={row.level}
                                  onChange={(event) => setTradeForm((prev) => ({
                                    ...prev,
                                    marketStructure: prev.marketStructure.map((entry, entryIndex) => (
                                      entryIndex === index ? { ...entry, level: event.target.value } : entry
                                    )),
                                  }))}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend>Trade Info</legend>
                  <div className="grid-3">
                    <label>Date<input type="date" value={tradeForm.tradeDate} onChange={(event) => setTradeForm((prev) => ({ ...prev, tradeDate: event.target.value }))} required /></label>
                    <label>Time<input type="time" value={tradeForm.tradeTime} onChange={(event) => setTradeForm((prev) => ({ ...prev, tradeTime: event.target.value }))} /></label>
                    <label>Asset<input value={tradeForm.tradingAsset} onChange={(event) => setTradeForm((prev) => ({ ...prev, tradingAsset: event.target.value }))} required /></label>
                    <label>Buy / Sell<select value={tradeForm.tradeSide} onChange={(event) => setTradeForm((prev) => ({ ...prev, tradeSide: event.target.value as TradeLogFormState['tradeSide'] }))}><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
                    <label>Strategy<input value={tradeForm.strategy} onChange={(event) => setTradeForm((prev) => ({ ...prev, strategy: event.target.value }))} required /></label>
                    <label>R/R (1:X)<input type="number" step="0.01" value={tradeForm.riskRewardRatio} onChange={(event) => setTradeForm((prev) => ({ ...prev, riskRewardRatio: event.target.value }))} /></label>
                  </div>
                  <div className="grid-3">
                    <label>Entry price<input type="number" step="0.01" value={tradeForm.entryPrice} onChange={(event) => setTradeForm((prev) => ({ ...prev, entryPrice: event.target.value }))} /></label>
                    <label>Stop loss price<input type="number" step="0.01" value={tradeForm.stopLossPrice} onChange={(event) => setTradeForm((prev) => ({ ...prev, stopLossPrice: event.target.value }))} /></label>
                    <label>Take profit price<input type="number" step="0.01" value={tradeForm.takeProfitPrice} onChange={(event) => setTradeForm((prev) => ({ ...prev, takeProfitPrice: event.target.value }))} /></label>
                  </div>
                  <div className="grid-3">
                    <label>Estimated loss (auto)<input readOnly value={estimatedLossValue ?? ''} /></label>
                    <label>Estimated profit (auto)<input readOnly value={estimatedProfitValue ?? ''} /></label>
                    <label>Exit price<input type="number" step="0.01" value={tradeForm.exitPrice} onChange={(event) => setTradeForm((prev) => ({ ...prev, exitPrice: event.target.value }))} /></label>
                  </div>
                  <div className="grid-3">
                    <label>Trade profit (auto)<input readOnly value={tradeProfitValue ?? ''} /></label>
                    <label>Feelings<select value={tradeForm.feelings} onChange={(event) => setTradeForm((prev) => ({ ...prev, feelings: event.target.value as TradeLogFormState['feelings'] }))}><option>Satisfied</option><option>Neutral</option><option>Disappointed</option><option>Not filled</option></select></label>
                  </div>
                  <label>
                    Confluences
                    <select
                      multiple
                      size={Math.min(Math.max(confluenceSuggestions.length, 4), 10)}
                      value={tradeForm.confluences}
                      onChange={(event) => {
                        const selectedValues = Array.from(event.target.selectedOptions).map((option) => option.value);
                        setTradeForm((prev) => ({ ...prev, confluences: selectedValues }));
                      }}
                    >
                      {confluenceSuggestions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label>Price chart link<input value={tradeForm.chartLink} onChange={(event) => setTradeForm((prev) => ({ ...prev, chartLink: event.target.value }))} /></label>
                  {tradeForm.chartLink.trim().length > 0 && (
                    <a href={tradeForm.chartLink} target="_blank" rel="noreferrer">Open chart hyperlink</a>
                  )}
                  <label>Comments<textarea rows={3} value={tradeForm.comments} onChange={(event) => setTradeForm((prev) => ({ ...prev, comments: event.target.value }))} /></label>
                  </fieldset>
                  <div className="form-footer">
                    <span />
                    <div className="inline-actions">
                      {editingSessionTrade && <button type="button" className="ghost" onClick={deleteSessionTrade}>Delete</button>}
                      <button type="submit" disabled={busy}>{editingSessionTrade ? 'Update Trade' : 'Save Trade'}</button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

      {tradingDayDialogOpen && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true">
          <div className="dialog-card">
            <div className="panel-header">
              <h3>Create Trading Day</h3>
              <button type="button" className="ghost" onClick={() => setTradingDayDialogOpen(false)}>Close</button>
            </div>
            <form className="market-form" onSubmit={saveTradingDay}>
              <div className="grid-3">
                <label>Date<input type="date" value={tradingDayForm.tradingDate} onChange={(event) => setTradingDayForm((prev) => ({ ...prev, tradingDate: event.target.value }))} required /></label>
                <label>Title<input value={tradingDayForm.title} onChange={(event) => setTradingDayForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Optional day title" /></label>
              </div>
              <label>Notes<textarea rows={3} value={tradingDayForm.notes} onChange={(event) => setTradingDayForm((prev) => ({ ...prev, notes: event.target.value }))} /></label>
              <div className="form-footer"><span /><button type="submit" disabled={busy}>Save Trading Day</button></div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'confluences' && (
        <section className="panel">
          <h2>Manage Confluences</h2>
          <p className="subtitle">
            Base confluences are available to all users. Add your own custom confluences for personal use.
          </p>

          <article className="confluence-manage-card">
            <form className="confluence-form" onSubmit={saveConfluence}>
              <label>
                Add custom confluence
                <input
                  value={newConfluence}
                  onChange={(event) => setNewConfluence(event.target.value)}
                  placeholder="Type a confluence and save"
                  required
                />
              </label>
              <button type="submit" disabled={busy}>Save confluence</button>
            </form>

            <div className="confluence-grid">
              {customConfluences.map((item) => (
                <div key={`${item.id}-${item.name}`} className="confluence-pill">
                  {editingConfluenceKey === `custom:${item.id}:${item.createdAt}` ? (
                    <div className="confluence-inline-edit">
                      <input
                        value={editingConfluenceValue}
                        onChange={(event) => setEditingConfluenceValue(event.target.value)}
                        autoFocus
                      />
                      <div className="confluence-inline-actions">
                        <button type="button" onClick={() => void updateConfluence(item)} disabled={busy}>Save</button>
                        <button type="button" className="ghost" onClick={() => void deleteConfluence(item)} disabled={busy}>Delete</button>
                        <button type="button" className="ghost" onClick={cancelEditConfluence} disabled={busy}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span>{item.name}</span>
                      <button
                        type="button"
                        className="icon-button"
                        title="Edit custom confluence"
                        aria-label="Edit custom confluence"
                        onClick={() => beginEditConfluence('custom', item)}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                          <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58zM20.71 5.63a1 1 0 0 0 0-1.41L19.78 3.3a1 1 0 0 0-1.41 0l-1.5 1.5 3.75 3.75 1.09-1.09z" fill="currentColor" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              ))}
              {customConfluences.length === 0 && <p>No custom confluences yet.</p>}
            </div>
          </article>

          {isAdmin && (
            <article className="confluence-manage-card">
              <h3>Manage Base Confluences</h3>
              <form className="confluence-form" onSubmit={saveBaseConfluence}>
                <label>
                  Add base confluence
                  <input
                    value={newBaseConfluence}
                    onChange={(event) => setNewBaseConfluence(event.target.value)}
                    placeholder="Type base confluence and save"
                    required
                  />
                </label>
                <button type="submit" disabled={busy}>Save base confluence</button>
              </form>

              <div className="confluence-grid">
                {baseConfluences.map((item) => (
                  <div key={`${item.id}-${item.name}`} className="confluence-pill">
                    {item.createdAt && editingConfluenceKey === `base:${item.id}:${item.createdAt}` ? (
                      <div className="confluence-inline-edit">
                        <input
                          value={editingConfluenceValue}
                          onChange={(event) => setEditingConfluenceValue(event.target.value)}
                          autoFocus
                        />
                        <div className="confluence-inline-actions">
                          <button type="button" onClick={() => void updateBaseConfluence(item)} disabled={busy}>Save</button>
                          <button type="button" className="ghost" onClick={() => void deleteBaseConfluence(item)} disabled={busy}>Delete</button>
                          <button type="button" className="ghost" onClick={cancelEditConfluence} disabled={busy}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span>{item.name}</span>
                        {item.createdAt ? (
                          <button
                            type="button"
                            className="icon-button"
                            title="Edit base confluence"
                            aria-label="Edit base confluence"
                            onClick={() => beginEditConfluence('base', item)}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                              <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58zM20.71 5.63a1 1 0 0 0 0-1.41L19.78 3.3a1 1 0 0 0-1.41 0l-1.5 1.5 3.75 3.75 1.09-1.09z" fill="currentColor" />
                            </svg>
                          </button>
                        ) : (
                          <small>Default</small>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </article>
          )}
        </section>
      )}

      {error && <p className="error-banner">{error}</p>}
    </main>
  );
}

export default App;
