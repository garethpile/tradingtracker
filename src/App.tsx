import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../amplify_outputs.json';
import './App.css';

type MenuTab = 'checklist' | 'analysis' | 'trades' | 'confluences';

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

type MarketAnalysisItem = AnalysisFormState & {
  id: string;
  createdAt: string;
  analysisScore: number;
};

type AnalysisTrendResponse = {
  days: number;
  totalAnalyses: number;
  averageCompletionScore: number;
  conclusionMix: Record<string, number>;
  directionalBiasMix: Record<string, number>;
  dailyCompletion: Array<{ date: string; averageScore: number; analyses: number }>;
};

type TradeLogFormState = {
  tradeDate: string;
  tradeTime: string;
  sessionName: string;
  tradingAsset: string;
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

type TradingSessionItem = {
  id: string;
  createdAt: string;
  dayId: string;
  name: string;
  analysisTime?: string;
  tradingAsset: string;
  strategy?: string;
  directionalBias?: 'bullish' | 'bearish' | 'consolidation' | 'none';
  confluences?: string[];
  notes?: string;
};

type SessionTradeItem = TradeLogItem & {
  dayId: string;
  sessionId: string;
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

const defaultAnalysisForm = (): AnalysisFormState => ({
  pair: 'XAUUSD',
  tradingDate: new Date().toISOString().slice(0, 10),
  sessionName: 'London Open',
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
  conclusion: 'bullish',
  prevDayLow: '',
  prevDayHigh: '',
  currentDayLow: '',
  currentDayHigh: '',
  futuresPrice: '',
  priceActionNotes: '',
  redFolderNews: false,
  newsImpact: 'high',
  newsTime: '',
  newsNotes: '',
  sellRsiLevel: '',
  buyRsiLevel: '',
  hasClearTrend: true,
  currentTrend: 'bullish',
  directionalBias: 'bullish',
  tradingStyle: 'trend',
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
});

const defaultTradeForm = (): TradeLogFormState => ({
  tradeDate: new Date().toISOString().slice(0, 10),
  tradeTime: new Date().toTimeString().slice(0, 5),
  sessionName: 'London Open',
  tradingAsset: 'XAUUSD',
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

const defaultTradingSessionForm = () => ({
  name: '',
  analysisTime: new Date().toTimeString().slice(0, 5),
  tradingAsset: 'XAUUSD',
  strategy: '',
  directionalBias: 'none' as 'bullish' | 'bearish' | 'consolidation' | 'none',
  confluencesText: '',
  notes: '',
});

const defaultTradingDayAnalysisQuickForm = () => ({
  pair: 'XAUUSD',
  sessionName: 'London Open',
  conclusion: 'bullish' as AnalysisFormState['conclusion'],
  currentTrend: 'bullish' as AnalysisDirection,
  directionalBias: 'bullish' as AnalysisFormState['directionalBias'],
  tradingStyle: 'trend' as AnalysisFormState['tradingStyle'],
  futuresPrice: '',
  priceActionNotes: '',
  newsNotes: '',
});

const outputConfig = {
  apiUrl: (outputs as { custom?: { tradingTrackerApiUrl?: string } }).custom?.tradingTrackerApiUrl
    || (import.meta.env.VITE_TRADING_API_URL as string | undefined)
    || '',
};

const sentimentFields: Array<{ key: keyof AnalysisFormState; label: string }> = [
  { key: 'fundamentalsSentiment', label: 'Fundamentals / News sentiment' },
  { key: 'movingAverages5m', label: 'Moving averages (5m)' },
  { key: 'patternsTrend5m', label: 'Pattern trend (5m)' },
  { key: 'movingAverages1h', label: 'Moving averages (1h)' },
  { key: 'patternsTrend1h', label: 'Pattern trend (1h)' },
  { key: 'relativeStrength5m', label: 'Relative strength (5m)' },
  { key: 'relativeStrength1h', label: 'Relative strength (1h)' },
  { key: 'candle1h', label: 'Candle (1h)' },
  { key: 'candle4h', label: 'Candle (4h)' },
  { key: 'candleDaily', label: 'Candle (Daily)' },
  { key: 'candleWeekly', label: 'Candle (Weekly)' },
  { key: 'candleMonthly', label: 'Candle (Monthly)' },
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

const computeTradeProfit = (entry?: number, exit?: number, takeProfit?: number): number | undefined => {
  if (entry === undefined || exit === undefined) {
    return undefined;
  }

  const isBuy = takeProfit === undefined ? true : takeProfit >= entry;
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
  const [analysisForm, setAnalysisForm] = useState<AnalysisFormState>(defaultAnalysisForm);
  const [tradeForm, setTradeForm] = useState<TradeLogFormState>(defaultTradeForm);

  const [checklistHistory, setChecklistHistory] = useState<ChecklistItem[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<MarketAnalysisItem[]>([]);
  const [tradingDays, setTradingDays] = useState<TradingDayItem[]>([]);
  const [tradingSessions, setTradingSessions] = useState<TradingSessionItem[]>([]);
  const [sessionTrades, setSessionTrades] = useState<Record<string, SessionTradeItem[]>>({});
  const [selectedTradingDayId, setSelectedTradingDayId] = useState<string | null>(null);
  const [selectedTradingSessionId, setSelectedTradingSessionId] = useState<string | null>(null);
  const [editingTradingSession, setEditingTradingSession] = useState<{ id: string; createdAt: string } | null>(null);
  const [editingSessionTrade, setEditingSessionTrade] = useState<{ id: string; createdAt: string } | null>(null);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [tradingDayDialogOpen, setTradingDayDialogOpen] = useState(false);
  const [tradingDayForm, setTradingDayForm] = useState(defaultTradingDayForm);
  const [tradingSessionForm, setTradingSessionForm] = useState(defaultTradingSessionForm);
  const [tradingDayYearFilter, setTradingDayYearFilter] = useState('all');
  const [tradingDayMonthFilter, setTradingDayMonthFilter] = useState('all');
  const [tradingDaySearch, setTradingDaySearch] = useState('');
  const [tradingDayAnalysisDialogOpen, setTradingDayAnalysisDialogOpen] = useState(false);
  const [tradingDayAnalysisQuickForm, setTradingDayAnalysisQuickForm] = useState(defaultTradingDayAnalysisQuickForm);
  const [editingTradingDayAnalysis, setEditingTradingDayAnalysis] = useState<{ id: string; createdAt: string } | null>(null);
  const [confluenceItems, setConfluenceItems] = useState<ConfluenceItem[]>([]);
  const [baseConfluences, setBaseConfluences] = useState<ConfluenceItem[]>([]);
  const [customConfluences, setCustomConfluences] = useState<ConfluenceItem[]>([]);
  const [newConfluence, setNewConfluence] = useState('');
  const [newBaseConfluence, setNewBaseConfluence] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingConfluenceKey, setEditingConfluenceKey] = useState<string | null>(null);
  const [editingConfluenceValue, setEditingConfluenceValue] = useState('');

  const [checklistTrends, setChecklistTrends] = useState<TrendResponse | null>(null);
  const [analysisTrends, setAnalysisTrends] = useState<AnalysisTrendResponse | null>(null);

  const [days, setDays] = useState(30);
  const [tradeStatsOpen, setTradeStatsOpen] = useState(true);
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
  const tradeProfitValue = computeTradeProfit(entryPriceValue, exitPriceValue, takeProfitPriceValue);
  const selectedTradingDay = useMemo(
    () => tradingDays.find((item) => item.id === selectedTradingDayId) ?? null,
    [tradingDays, selectedTradingDayId],
  );
  const selectedDayAnalyses = useMemo(
    () => analysisHistory
      .filter((item) => item.tradingDate === selectedTradingDay?.tradingDate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [analysisHistory, selectedTradingDay],
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
      setTradingSessions([]);
      setSessionTrades({});
      return;
    }

    void (async () => {
      try {
        const sessionRes = await apiCall<{ items: TradingSessionItem[] }>(`trading-sessions?dayId=${encodeURIComponent(selectedTradingDayId)}`);
        setTradingSessions(sessionRes.items);
        const tradeEntries = await Promise.all(
          sessionRes.items.map(async (session) => {
            const tradesRes = await apiCall<{ items: SessionTradeItem[] }>(`session-trades?sessionId=${encodeURIComponent(session.id)}`);
            return [session.id, tradesRes.items] as const;
          }),
        );
        setSessionTrades(Object.fromEntries(tradeEntries));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load trading day sessions');
      }
    })();
  }, [selectedTradingDayId]);

  const loadData = async (windowDays = days) => {
    const [checksRes, checksTrendRes, analysisRes, analysisTrendRes, confluencesRes, tradingDaysRes] = await Promise.all([
      apiCall<{ items: ChecklistItem[] }>(`checks?days=${windowDays}`),
      apiCall<TrendResponse>(`checks/trends?days=${windowDays}`),
      apiCall<{ items: MarketAnalysisItem[] }>(`analysis?days=${windowDays}`),
      apiCall<AnalysisTrendResponse>(`analysis/trends?days=${windowDays}`),
      apiCall<ConfluenceResponse>('confluences'),
      apiCall<{ items: TradingDayItem[] }>(`trading-days?days=${windowDays}`),
    ]);

    setChecklistHistory(checksRes.items);
    setChecklistTrends(checksTrendRes);
    setAnalysisHistory(analysisRes.items);
    setAnalysisTrends(analysisTrendRes);
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

  const saveAnalysis = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await apiCall<MarketAnalysisItem>('analysis', {
        method: 'POST',
        body: JSON.stringify(analysisForm),
      });
      setAnalysisForm(defaultAnalysisForm());
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save market analysis');
    } finally {
      setBusy(false);
    }
  };

  const refreshTradingDayHierarchy = async (dayId: string) => {
    const sessionRes = await apiCall<{ items: TradingSessionItem[] }>(`trading-sessions?dayId=${encodeURIComponent(dayId)}`);
    setTradingSessions(sessionRes.items);

    const tradeEntries = await Promise.all(
      sessionRes.items.map(async (session) => {
        const tradesRes = await apiCall<{ items: SessionTradeItem[] }>(`session-trades?sessionId=${encodeURIComponent(session.id)}`);
        return [session.id, tradesRes.items] as const;
      }),
    );

    setSessionTrades(Object.fromEntries(tradeEntries));
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

  const openCreateTradingDayAnalysisDialog = () => {
    setEditingTradingDayAnalysis(null);
    setTradingDayAnalysisQuickForm(defaultTradingDayAnalysisQuickForm());
    setTradingDayAnalysisDialogOpen(true);
  };

  const openEditTradingDayAnalysisDialog = (item: MarketAnalysisItem) => {
    setEditingTradingDayAnalysis({ id: item.id, createdAt: item.createdAt });
    setTradingDayAnalysisQuickForm({
      pair: item.pair,
      sessionName: item.sessionName,
      conclusion: item.conclusion,
      currentTrend: item.currentTrend,
      directionalBias: item.directionalBias,
      tradingStyle: item.tradingStyle,
      futuresPrice: item.futuresPrice ?? '',
      priceActionNotes: item.priceActionNotes ?? '',
      newsNotes: item.newsNotes ?? '',
    });
    setTradingDayAnalysisDialogOpen(true);
  };

  const closeTradingDayAnalysisDialog = () => {
    setTradingDayAnalysisDialogOpen(false);
    setEditingTradingDayAnalysis(null);
    setTradingDayAnalysisQuickForm(defaultTradingDayAnalysisQuickForm());
  };

  const saveTradingDayAnalysis = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTradingDay) {
      setError('Select a trading day first');
      return;
    }

    const payload: AnalysisFormState = {
      ...defaultAnalysisForm(),
      tradingDate: selectedTradingDay.tradingDate,
      pair: tradingDayAnalysisQuickForm.pair,
      sessionName: tradingDayAnalysisQuickForm.sessionName,
      conclusion: tradingDayAnalysisQuickForm.conclusion,
      currentTrend: tradingDayAnalysisQuickForm.currentTrend,
      directionalBias: tradingDayAnalysisQuickForm.directionalBias,
      tradingStyle: tradingDayAnalysisQuickForm.tradingStyle,
      futuresPrice: tradingDayAnalysisQuickForm.futuresPrice,
      priceActionNotes: tradingDayAnalysisQuickForm.priceActionNotes,
      newsNotes: tradingDayAnalysisQuickForm.newsNotes,
    };

    setBusy(true);
    setError(null);
    try {
      if (editingTradingDayAnalysis) {
        await apiCall<MarketAnalysisItem>(`analysis?createdAt=${encodeURIComponent(editingTradingDayAnalysis.createdAt)}&id=${encodeURIComponent(editingTradingDayAnalysis.id)}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        await apiCall<MarketAnalysisItem>('analysis', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      await loadData();
      closeTradingDayAnalysisDialog();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save market analysis');
    } finally {
      setBusy(false);
    }
  };

  const deleteTradingDayAnalysis = async (item: MarketAnalysisItem) => {
    const confirmed = window.confirm('Delete this market analysis entry?');
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiCall<{ deleted: boolean }>(`analysis?createdAt=${encodeURIComponent(item.createdAt)}&id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete market analysis');
    } finally {
      setBusy(false);
    }
  };

  const deleteTradingDay = async (item: TradingDayItem) => {
    const confirmed = window.confirm('Delete this trading day and all its sessions/trades?');
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

  const saveTradingSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTradingDayId) {
      setError('Create or select a trading day first');
      return;
    }

    const payload = {
      dayId: selectedTradingDayId,
      name: tradingSessionForm.name.trim(),
      analysisTime: tradingSessionForm.analysisTime,
      tradingAsset: tradingSessionForm.tradingAsset.trim(),
      strategy: tradingSessionForm.strategy.trim(),
      directionalBias: tradingSessionForm.directionalBias,
      confluences: tradingSessionForm.confluencesText
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
      notes: tradingSessionForm.notes.trim(),
    };

    if (!payload.name || !payload.tradingAsset) {
      setError('Trading analysis session requires name and trading asset');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (editingTradingSession) {
        await apiCall<TradingSessionItem>(`trading-sessions?createdAt=${encodeURIComponent(editingTradingSession.createdAt)}&id=${encodeURIComponent(editingTradingSession.id)}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        await apiCall<TradingSessionItem>('trading-sessions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setTradingSessionForm(defaultTradingSessionForm());
      setEditingTradingSession(null);
      await refreshTradingDayHierarchy(selectedTradingDayId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save trading analysis session');
    } finally {
      setBusy(false);
    }
  };

  const beginEditTradingSession = (item: TradingSessionItem) => {
    setEditingTradingSession({ id: item.id, createdAt: item.createdAt });
    setTradingSessionForm({
      name: item.name,
      analysisTime: item.analysisTime ?? '',
      tradingAsset: item.tradingAsset,
      strategy: item.strategy ?? '',
      directionalBias: item.directionalBias ?? 'none',
      confluencesText: (item.confluences ?? []).join(', '),
      notes: item.notes ?? '',
    });
  };

  const deleteTradingSession = async (item: TradingSessionItem) => {
    const confirmed = window.confirm('Delete this trading analysis session and all its trades?');
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiCall<{ deleted: boolean }>(`trading-sessions?createdAt=${encodeURIComponent(item.createdAt)}&id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      if (selectedTradingDayId) {
        await refreshTradingDayHierarchy(selectedTradingDayId);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete trading analysis session');
    } finally {
      setBusy(false);
    }
  };

  const openTradeDialog = (sessionId: string, item?: SessionTradeItem) => {
    setSelectedTradingSessionId(sessionId);
    if (item) {
      setEditingSessionTrade({ id: item.id, createdAt: item.createdAt });
      setTradeForm({
        tradeDate: item.tradeDate,
        tradeTime: item.tradeTime ?? '',
        sessionName: item.sessionName ?? '',
        tradingAsset: item.tradingAsset,
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
    setSelectedTradingSessionId(null);
    setTradeForm(defaultTradeForm());
  };

  const saveSessionTrade = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTradingDayId || !selectedTradingSessionId) {
      setError('Select a trading analysis session first');
      return;
    }

    const payload = {
      dayId: selectedTradingDayId,
      sessionId: selectedTradingSessionId,
      tradeDate: tradeForm.tradeDate,
      tradeTime: tradeForm.tradeTime,
      tradingAsset: tradeForm.tradingAsset,
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
        await refreshTradingDayHierarchy(selectedTradingDayId);
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
        await refreshTradingDayHierarchy(selectedTradingDayId);
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
          <button className={activeTab === 'analysis' ? 'tab active' : 'tab'} onClick={() => setActiveTab('analysis')}>Analysis</button>
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

      {activeTab === 'analysis' && (
        <>
          <section className="panel market-section">
            <h2>Capture Market Analysis</h2>
            <form className="market-form" onSubmit={saveAnalysis}>
              <div className="grid-3">
                <label>Pair<input type="text" value={analysisForm.pair} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, pair: event.target.value }))} required /></label>
                <label>Date<input type="date" value={analysisForm.tradingDate} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, tradingDate: event.target.value }))} required /></label>
                <label>Session<select value={analysisForm.sessionName} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, sessionName: event.target.value }))}><option>London Open</option><option>New York Open</option><option>Asia Session</option><option>Custom</option></select></label>
              </div>

              <fieldset>
                <legend>Pre-Market Checklist</legend>
                <div className="analysis-rows">
                  {sentimentFields.map((field) => (
                    <label key={field.key} className="analysis-row">
                      <span>{field.label}</span>
                      <select value={analysisForm[field.key] as string} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, [field.key]: event.target.value }))}>
                        <option value="bullish">Bullish</option><option value="bearish">Bearish</option><option value="consolidation">Consolidation</option><option value="none">None</option>
                      </select>
                    </label>
                  ))}
                </div>
                <label>
                  Conclusion
                  <select value={analysisForm.conclusion} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, conclusion: event.target.value as AnalysisFormState['conclusion'] }))}>
                    <option value="bullish">Bullish</option><option value="bearish">Bearish</option><option value="consolidation">Consolidation</option><option value="bearishConsolidation">Bearish Consolidation</option><option value="bullishConsolidation">Bullish Consolidation</option>
                  </select>
                </label>
              </fieldset>

              <fieldset>
                <legend>Price Action / News / Notes</legend>
                <div className="grid-3">
                  <label>Prev day low<input value={analysisForm.prevDayLow} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, prevDayLow: event.target.value }))} /></label>
                  <label>Prev day high<input value={analysisForm.prevDayHigh} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, prevDayHigh: event.target.value }))} /></label>
                  <label>Futures price<input value={analysisForm.futuresPrice} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, futuresPrice: event.target.value }))} /></label>
                  <label>Current day low<input value={analysisForm.currentDayLow} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, currentDayLow: event.target.value }))} /></label>
                  <label>Current day high<input value={analysisForm.currentDayHigh} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, currentDayHigh: event.target.value }))} /></label>
                  <label>News time (GMT+2)<input value={analysisForm.newsTime} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, newsTime: event.target.value }))} /></label>
                </div>
                <div className="grid-3">
                  <label>Red folder news<select value={analysisForm.redFolderNews ? 'yes' : 'no'} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, redFolderNews: event.target.value === 'yes' }))}><option value="yes">Yes</option><option value="no">No</option></select></label>
                  <label>News impact<select value={analysisForm.newsImpact} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, newsImpact: event.target.value as Impact }))}><option value="high">High</option><option value="low">Low</option></select></label>
                  <label>Current trend<select value={analysisForm.currentTrend} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, currentTrend: event.target.value as AnalysisDirection }))}><option value="bullish">Bullish</option><option value="bearish">Bearish</option><option value="consolidation">Consolidation</option><option value="none">None</option></select></label>
                </div>
                <label>Price action notes<textarea rows={2} value={analysisForm.priceActionNotes} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, priceActionNotes: event.target.value }))} /></label>
                <label>News notes<textarea rows={2} value={analysisForm.newsNotes} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, newsNotes: event.target.value }))} /></label>
              </fieldset>

              <fieldset>
                <legend>Zones / Market Structure</legend>
                <div className="grid-3">
                  <label>Sell zone 1<input value={analysisForm.sellZone1} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, sellZone1: event.target.value }))} /></label>
                  <label>Sell zone 2<input value={analysisForm.sellZone2} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, sellZone2: event.target.value }))} /></label>
                  <label>Sell zone 3<input value={analysisForm.sellZone3} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, sellZone3: event.target.value }))} /></label>
                  <label>Buy zone 1<input value={analysisForm.buyZone1} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, buyZone1: event.target.value }))} /></label>
                  <label>Buy zone 2<input value={analysisForm.buyZone2} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, buyZone2: event.target.value }))} /></label>
                  <label>Buy zone 3<input value={analysisForm.buyZone3} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, buyZone3: event.target.value }))} /></label>
                  <label>Reversal zone 1<input value={analysisForm.reversalZone1} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, reversalZone1: event.target.value }))} /></label>
                  <label>Reversal zone 2<input value={analysisForm.reversalZone2} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, reversalZone2: event.target.value }))} /></label>
                  <label>Swing zone 1<input value={analysisForm.swingZone1} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, swingZone1: event.target.value }))} /></label>
                  <label>Swing zone 2<input value={analysisForm.swingZone2} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, swingZone2: event.target.value }))} /></label>
                </div>
                <div className="market-structure-grid">
                  {analysisForm.marketStructure.map((row, index) => (
                    <div key={row.rangeName} className="market-structure-row">
                      <span>{row.rangeName}</span>
                      <select value={row.bias} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, marketStructure: prev.marketStructure.map((entry, idx) => idx === index ? { ...entry, bias: event.target.value as MarketStructureBias } : entry) }))}>
                        <option value="none">None</option><option value="buy">Buy</option><option value="sell">Sell</option>
                      </select>
                      <input value={row.level} placeholder="Level" onChange={(event) => setAnalysisForm((prev) => ({ ...prev, marketStructure: prev.marketStructure.map((entry, idx) => idx === index ? { ...entry, level: event.target.value } : entry) }))} />
                    </div>
                  ))}
                </div>
              </fieldset>

              <div className="form-footer"><span /><button type="submit" disabled={busy}>Save Market Analysis</button></div>
            </form>
          </section>

          <section className="panel">
            <h2>Market Analysis Trends</h2>
            {analysisTrends ? (
              <>
                <div className="stats-grid">
                  <div className="stat-card"><p>Total Analyses</p><h3>{analysisTrends.totalAnalyses}</h3></div>
                  <div className="stat-card"><p>Avg Completion</p><h3>{analysisTrends.averageCompletionScore}%</h3></div>
                  <div className="stat-card"><p>Bullish Conclusion</p><h3>{analysisTrends.conclusionMix.bullish ?? 0}%</h3></div>
                </div>
                <h3 className="section-title">Daily Analysis Completion</h3>
                <div className="trend-bars">
                  {analysisTrends.dailyCompletion.map((item) => (
                    <div key={item.date} className="trend-bar-row">
                      <span>{item.date}</span>
                      <div className="bar-track"><div className="bar-fill analysis" style={{ width: `${item.averageScore}%` }} /></div>
                      <span>{item.averageScore}%</span>
                    </div>
                  ))}
                </div>
                <h3 className="section-title">Recent Analyses</h3>
                <div className="history-table-wrapper">
                  <table className="history-table">
                    <thead><tr><th>Date</th><th>Session</th><th>Pair</th><th>Conclusion</th><th>Score</th></tr></thead>
                    <tbody>
                      {analysisHistory.map((item) => (
                        <tr key={item.id}><td>{item.tradingDate}</td><td>{item.sessionName}</td><td>{item.pair}</td><td>{item.conclusion}</td><td>{item.analysisScore}%</td></tr>
                      ))}
                      {analysisHistory.length === 0 && <tr><td colSpan={5}>No analyses in this period.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <p>Load data to view analysis trends.</p>}
          </section>
        </>
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
                  <h3>Market Analysis</h3>
                  <button type="button" className="ghost" onClick={openCreateTradingDayAnalysisDialog}>Add analysis</button>
                </div>
                <div className="history-table-wrapper">
                  <table className="history-table">
                    <thead><tr><th>Time</th><th>Pair</th><th>Session</th><th>Conclusion</th><th /></tr></thead>
                    <tbody>
                      {selectedDayAnalyses.map((item) => (
                        <tr key={item.id}>
                          <td>{new Date(item.createdAt).toISOString().slice(11, 16)}</td>
                          <td>{item.pair}</td>
                          <td>{item.sessionName}</td>
                          <td>{item.conclusion}</td>
                          <td>
                            <div className="inline-actions">
                              <button type="button" className="ghost" onClick={() => openEditTradingDayAnalysisDialog(item)}>Open</button>
                              <button type="button" className="icon-button" onClick={() => void deleteTradingDayAnalysis(item)} title="Delete market analysis" aria-label="Delete market analysis">
                                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" fill="currentColor" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {selectedDayAnalyses.length === 0 && <tr><td colSpan={5}>No market analyses for this trading day.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="confluence-manage-card">
                <div className="collapsible-header">
                  <h3>Trading Analysis Sessions</h3>
                  <button type="button" className="ghost" onClick={() => setTradeStatsOpen((prev) => !prev)}>
                    {tradeStatsOpen ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                {tradeStatsOpen && (
                  <>
                    <form className="market-form" onSubmit={saveTradingSession}>
                      <div className="grid-3">
                        <label>Session name<input value={tradingSessionForm.name} onChange={(event) => setTradingSessionForm((prev) => ({ ...prev, name: event.target.value }))} required /></label>
                        <label>Analysis time<input type="time" value={tradingSessionForm.analysisTime} onChange={(event) => setTradingSessionForm((prev) => ({ ...prev, analysisTime: event.target.value }))} /></label>
                        <label>Trading asset<input value={tradingSessionForm.tradingAsset} onChange={(event) => setTradingSessionForm((prev) => ({ ...prev, tradingAsset: event.target.value }))} required /></label>
                        <label>Strategy<input value={tradingSessionForm.strategy} onChange={(event) => setTradingSessionForm((prev) => ({ ...prev, strategy: event.target.value }))} /></label>
                        <label>Directional bias<select value={tradingSessionForm.directionalBias} onChange={(event) => setTradingSessionForm((prev) => ({ ...prev, directionalBias: event.target.value as typeof prev.directionalBias }))}><option value="none">None</option><option value="bullish">Bullish</option><option value="bearish">Bearish</option><option value="consolidation">Consolidation</option></select></label>
                        <label>Confluences (comma-separated)<input value={tradingSessionForm.confluencesText} onChange={(event) => setTradingSessionForm((prev) => ({ ...prev, confluencesText: event.target.value }))} /></label>
                      </div>
                      <label>Session notes<textarea rows={2} value={tradingSessionForm.notes} onChange={(event) => setTradingSessionForm((prev) => ({ ...prev, notes: event.target.value }))} /></label>
                      <div className="form-footer">
                        <span>{editingTradingSession ? 'Editing trading analysis session' : ''}</span>
                        <div className="inline-actions">
                          {editingTradingSession && <button type="button" className="ghost" onClick={() => { setEditingTradingSession(null); setTradingSessionForm(defaultTradingSessionForm()); }}>Cancel edit</button>}
                          <button type="submit" disabled={busy}>{editingTradingSession ? 'Update Session' : 'Add Session'}</button>
                        </div>
                      </div>
                    </form>

                    <div className="analysis-rows">
                      {tradingSessions.map((session) => (
                        <article key={session.id} className="panel">
                          <div className="panel-header">
                            <h3>{session.name}</h3>
                            <div className="inline-actions">
                              <button type="button" className="ghost" onClick={() => beginEditTradingSession(session)}>Edit Session</button>
                              <button type="button" className="ghost" onClick={() => openTradeDialog(session.id)}>Add Trade Info</button>
                              <button type="button" className="icon-button" onClick={() => void deleteTradingSession(session)} title="Delete session" aria-label="Delete session">
                                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" fill="currentColor" /></svg>
                              </button>
                            </div>
                          </div>
                          <p className="subtitle">{session.tradingAsset} | {session.analysisTime || '-'} | {session.directionalBias || 'none'}</p>
                          <p>{session.notes || 'No session notes.'}</p>
                          <h4 className="section-title">Trade Info</h4>
                          <div className="history-table-wrapper">
                            <table className="history-table">
                              <thead><tr><th>Date</th><th>Time</th><th>Asset</th><th>Profit</th><th /></tr></thead>
                              <tbody>
                                {(sessionTrades[session.id] ?? []).map((trade) => (
                                  <tr key={trade.id}>
                                    <td>{trade.tradeDate}</td>
                                    <td>{trade.tradeTime ?? '-'}</td>
                                    <td>{trade.tradingAsset}</td>
                                    <td>{trade.totalProfit ?? '-'}</td>
                                    <td><button type="button" className="ghost" onClick={() => openTradeDialog(session.id, trade)}>View / Edit</button></td>
                                  </tr>
                                ))}
                                {(sessionTrades[session.id] ?? []).length === 0 && <tr><td colSpan={5}>No trades for this session yet.</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        </article>
                      ))}
                      {tradingSessions.length === 0 && <p>No trading analysis sessions yet for this day.</p>}
                    </div>
                  </>
                )}
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
                  <div className="grid-3">
                    <label>Date<input type="date" value={tradeForm.tradeDate} onChange={(event) => setTradeForm((prev) => ({ ...prev, tradeDate: event.target.value }))} required /></label>
                    <label>Time<input type="time" value={tradeForm.tradeTime} onChange={(event) => setTradeForm((prev) => ({ ...prev, tradeTime: event.target.value }))} /></label>
                    <label>Asset<input value={tradeForm.tradingAsset} onChange={(event) => setTradeForm((prev) => ({ ...prev, tradingAsset: event.target.value }))} required /></label>
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
                  <label>Confluences (comma-separated)<input value={tradeForm.confluences.join(', ')} onChange={(event) => setTradeForm((prev) => ({ ...prev, confluences: event.target.value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0) }))} /></label>
                  <label>Price chart link<input value={tradeForm.chartLink} onChange={(event) => setTradeForm((prev) => ({ ...prev, chartLink: event.target.value }))} /></label>
                  <label>Comments<textarea rows={3} value={tradeForm.comments} onChange={(event) => setTradeForm((prev) => ({ ...prev, comments: event.target.value }))} /></label>
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

      {tradingDayAnalysisDialogOpen && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true">
          <div className="dialog-card">
            <div className="panel-header">
              <h3>{editingTradingDayAnalysis ? 'Update Market Analysis' : 'Add Market Analysis'}</h3>
              <button type="button" className="ghost" onClick={closeTradingDayAnalysisDialog}>Close</button>
            </div>
            <form className="market-form" onSubmit={saveTradingDayAnalysis}>
              <div className="grid-3">
                <label>Pair<input value={tradingDayAnalysisQuickForm.pair} onChange={(event) => setTradingDayAnalysisQuickForm((prev) => ({ ...prev, pair: event.target.value }))} required /></label>
                <label>Session<select value={tradingDayAnalysisQuickForm.sessionName} onChange={(event) => setTradingDayAnalysisQuickForm((prev) => ({ ...prev, sessionName: event.target.value }))}><option>London Open</option><option>New York Open</option><option>Asia Session</option><option>Custom</option></select></label>
                <label>Conclusion<select value={tradingDayAnalysisQuickForm.conclusion} onChange={(event) => setTradingDayAnalysisQuickForm((prev) => ({ ...prev, conclusion: event.target.value as AnalysisFormState['conclusion'] }))}><option value="bullish">Bullish</option><option value="bearish">Bearish</option><option value="consolidation">Consolidation</option><option value="bearishConsolidation">Bearish Consolidation</option><option value="bullishConsolidation">Bullish Consolidation</option></select></label>
                <label>Current trend<select value={tradingDayAnalysisQuickForm.currentTrend} onChange={(event) => setTradingDayAnalysisQuickForm((prev) => ({ ...prev, currentTrend: event.target.value as AnalysisDirection }))}><option value="bullish">Bullish</option><option value="bearish">Bearish</option><option value="consolidation">Consolidation</option><option value="none">None</option></select></label>
                <label>Directional bias<select value={tradingDayAnalysisQuickForm.directionalBias} onChange={(event) => setTradingDayAnalysisQuickForm((prev) => ({ ...prev, directionalBias: event.target.value as AnalysisFormState['directionalBias'] }))}><option value="bullish">Bullish</option><option value="bearish">Bearish</option><option value="none">None</option></select></label>
                <label>Trading style<select value={tradingDayAnalysisQuickForm.tradingStyle} onChange={(event) => setTradingDayAnalysisQuickForm((prev) => ({ ...prev, tradingStyle: event.target.value as AnalysisFormState['tradingStyle'] }))}><option value="trend">Trend</option><option value="consolidation">Consolidation</option></select></label>
              </div>
              <div className="grid-3">
                <label>Futures price<input value={tradingDayAnalysisQuickForm.futuresPrice} onChange={(event) => setTradingDayAnalysisQuickForm((prev) => ({ ...prev, futuresPrice: event.target.value }))} /></label>
              </div>
              <label>Price action notes<textarea rows={3} value={tradingDayAnalysisQuickForm.priceActionNotes} onChange={(event) => setTradingDayAnalysisQuickForm((prev) => ({ ...prev, priceActionNotes: event.target.value }))} /></label>
              <label>News notes<textarea rows={3} value={tradingDayAnalysisQuickForm.newsNotes} onChange={(event) => setTradingDayAnalysisQuickForm((prev) => ({ ...prev, newsNotes: event.target.value }))} /></label>
              <div className="form-footer">
                <span>{selectedTradingDay ? `Trading day: ${selectedTradingDay.tradingDate}` : ''}</span>
                <button type="submit" disabled={busy}>{editingTradingDayAnalysis ? 'Update Analysis' : 'Save Analysis'}</button>
              </div>
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
