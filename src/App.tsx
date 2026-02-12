import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../amplify_outputs.json';
import './App.css';

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

const defaultForm = (): FormState => ({
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

const buildAuthHeader = async () => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();

  if (!token) {
    throw new Error('No auth session token found');
  }

  return `Bearer ${token}`;
};

const apiCall = async <T,>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
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

const labelLookup: Array<{ key: BooleanFormKey; label: string; kind: 'question' | 'commitment' }> = [
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

function App() {
  return (
    <Authenticator signUpAttributes={['email', 'phone_number']}>
      {({ signOut, user }) => <TradingDashboard email={user?.signInDetails?.loginId ?? ''} onSignOut={signOut} />}
    </Authenticator>
  );
}

function TradingDashboard({ email, onSignOut }: { email: string; onSignOut?: (() => void) | undefined }) {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [analysisForm, setAnalysisForm] = useState<AnalysisFormState>(defaultAnalysisForm);
  const [history, setHistory] = useState<ChecklistItem[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<MarketAnalysisItem[]>([]);
  const [trends, setTrends] = useState<TrendResponse | null>(null);
  const [analysisTrends, setAnalysisTrends] = useState<AnalysisTrendResponse | null>(null);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readinessPreview = useMemo(() => {
    const fields = labelLookup.map((item) => form[item.key]);
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [form]);

  useEffect(() => {
    void refresh(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async (windowDays = days) => {
    const [checksRes, trendsRes, analysisRes, analysisTrendsRes] = await Promise.all([
      apiCall<{ items: ChecklistItem[] }>(`checks?days=${windowDays}`),
      apiCall<TrendResponse>(`checks/trends?days=${windowDays}`),
      apiCall<{ items: MarketAnalysisItem[] }>(`analysis?days=${windowDays}`),
      apiCall<AnalysisTrendResponse>(`analysis/trends?days=${windowDays}`),
    ]);

    setHistory(checksRes.items);
    setTrends(trendsRes);
    setAnalysisHistory(analysisRes.items);
    setAnalysisTrends(analysisTrendsRes);
  };

  const saveChecklist = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await apiCall<ChecklistItem>('checks', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm(defaultForm());
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save checklist');
    } finally {
      setBusy(false);
    }
  };

  const saveMarketAnalysis = async (event: FormEvent) => {
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

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Trading Tracker</p>
          <h1>Daily Pre-Trade Checklist and Market Analysis</h1>
          <p className="subtitle">
            Capture readiness and session-level market structure, then review analysis quality trends over time.
          </p>
        </div>
        <div className="hero-actions">
          <span>{email}</span>
          <button onClick={() => void refresh(days)} disabled={busy}>
            Refresh
          </button>
          <button className="ghost" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </section>

      <section className="content-grid">
        <article className="panel">
          <h2>Capture Checklist</h2>
          <form onSubmit={saveChecklist} className="checklist-form">
            <label>
              Date
              <input
                type="date"
                value={form.tradingDate}
                onChange={(event) => setForm((prev) => ({ ...prev, tradingDate: event.target.value }))}
                required
              />
            </label>

            <label>
              Session
              <select
                value={form.sessionName}
                onChange={(event) => setForm((prev) => ({ ...prev, sessionName: event.target.value }))}
              >
                <option>London Open</option>
                <option>New York Open</option>
                <option>Asia Session</option>
                <option>Custom</option>
              </select>
            </label>

            <fieldset>
              <legend>Self Evaluation</legend>
              {labelLookup
                .filter((item) => item.kind === 'question')
                .map((item) => (
                  <div key={item.key} className="choice-row">
                    <span>{item.label}</span>
                    <div className="toggle-group">
                      <button
                        type="button"
                        className={form[item.key] ? 'active' : ''}
                        onClick={() => setForm((prev) => ({ ...prev, [item.key]: true }))}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={!form[item.key] ? 'active' : ''}
                        onClick={() => setForm((prev) => ({ ...prev, [item.key]: false }))}
                      >
                        No
                      </button>
                    </div>
                  </div>
                ))}
            </fieldset>

            <fieldset>
              <legend>Commitments</legend>
              {labelLookup
                .filter((item) => item.kind === 'commitment')
                .map((item) => (
                  <label className="checkbox-row" key={item.key}>
                    <input
                      type="checkbox"
                      checked={form[item.key]}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, [item.key]: event.target.checked }))
                      }
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
            </fieldset>

            <label>
              Signature
              <input
                type="text"
                placeholder="Type your name"
                value={form.signature}
                onChange={(event) => setForm((prev) => ({ ...prev, signature: event.target.value }))}
                required
              />
            </label>

            <label>
              Notes
              <textarea
                rows={3}
                placeholder="Optional context"
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>

            <div className="form-footer">
              <span>Readiness score preview: {readinessPreview}%</span>
              <button type="submit" disabled={busy}>
                Save Checklist
              </button>
            </div>
          </form>
        </article>

        <article className="panel">
          <h2>Checklist Trends</h2>
          <div className="panel-header">
            <span />
            <label>
              Time window
              <select
                value={days}
                onChange={(event) => void refresh(Number(event.target.value))}
                disabled={busy}
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </label>
          </div>

          {trends ? (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <p>Total Captures</p>
                  <h3>{trends.totalCaptures}</h3>
                </div>
                <div className="stat-card">
                  <p>Average Readiness Score</p>
                  <h3>{trends.averageScore}%</h3>
                </div>
                <div className="stat-card">
                  <p>Environment Ready Rate</p>
                  <h3>{trends.readinessRates.environmentReady ?? 0}%</h3>
                </div>
              </div>

              <h3 className="section-title">Daily Score Trend</h3>
              <div className="trend-bars">
                {trends.dailyScores.map((item) => (
                  <div key={item.date} className="trend-bar-row">
                    <span>{item.date}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${item.averageScore}%` }} />
                    </div>
                    <span>{item.averageScore}%</span>
                  </div>
                ))}
                {trends.dailyScores.length === 0 && <p>No captures yet.</p>}
              </div>

              <h3 className="section-title">Recent Checklist Captures</h3>
              <div className="history-table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Session</th>
                      <th>Score</th>
                      <th>Signature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item.id}>
                        <td>{item.tradingDate}</td>
                        <td>{item.sessionName ?? '-'}</td>
                        <td>{item.score}%</td>
                        <td>{item.signature}</td>
                      </tr>
                    ))}
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={4}>No entries in this period.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p>Load data to view trends.</p>
          )}
        </article>
      </section>

      <section className="panel market-section">
        <h2>Capture Market Analysis</h2>
        <form className="market-form" onSubmit={saveMarketAnalysis}>
          <div className="grid-3">
            <label>
              Pair
              <input
                type="text"
                value={analysisForm.pair}
                onChange={(event) => setAnalysisForm((prev) => ({ ...prev, pair: event.target.value }))}
                required
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={analysisForm.tradingDate}
                onChange={(event) => setAnalysisForm((prev) => ({ ...prev, tradingDate: event.target.value }))}
                required
              />
            </label>
            <label>
              Session
              <select
                value={analysisForm.sessionName}
                onChange={(event) => setAnalysisForm((prev) => ({ ...prev, sessionName: event.target.value }))}
              >
                <option>London Open</option>
                <option>New York Open</option>
                <option>Asia Session</option>
                <option>Custom</option>
              </select>
            </label>
          </div>

          <fieldset>
            <legend>Pre-Market Checklist</legend>
            <div className="analysis-rows">
              {sentimentFields.map((field) => (
                <label key={field.key} className="analysis-row">
                  <span>{field.label}</span>
                  <select
                    value={analysisForm[field.key] as string}
                    onChange={(event) => setAnalysisForm((prev) => ({
                      ...prev,
                      [field.key]: event.target.value,
                    }))}
                  >
                    <option value="bullish">Bullish</option>
                    <option value="bearish">Bearish</option>
                    <option value="consolidation">Consolidation</option>
                    <option value="none">None</option>
                  </select>
                </label>
              ))}
            </div>
            <label>
              Conclusion
              <select
                value={analysisForm.conclusion}
                onChange={(event) => setAnalysisForm((prev) => ({
                  ...prev,
                  conclusion: event.target.value as AnalysisFormState['conclusion'],
                }))}
              >
                <option value="bullish">Bullish</option>
                <option value="bearish">Bearish</option>
                <option value="consolidation">Consolidation</option>
                <option value="bearishConsolidation">Bearish Consolidation</option>
                <option value="bullishConsolidation">Bullish Consolidation</option>
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend>Price Action and News</legend>
            <div className="grid-3">
              <label>
                Prev day low
                <input value={analysisForm.prevDayLow} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, prevDayLow: event.target.value }))} />
              </label>
              <label>
                Prev day high
                <input value={analysisForm.prevDayHigh} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, prevDayHigh: event.target.value }))} />
              </label>
              <label>
                Futures price
                <input value={analysisForm.futuresPrice} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, futuresPrice: event.target.value }))} />
              </label>
              <label>
                Current day low
                <input value={analysisForm.currentDayLow} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, currentDayLow: event.target.value }))} />
              </label>
              <label>
                Current day high
                <input value={analysisForm.currentDayHigh} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, currentDayHigh: event.target.value }))} />
              </label>
              <label>
                News time (GMT+2)
                <input value={analysisForm.newsTime} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, newsTime: event.target.value }))} />
              </label>
            </div>
            <div className="grid-3">
              <label>
                Red folder news
                <select
                  value={analysisForm.redFolderNews ? 'yes' : 'no'}
                  onChange={(event) => setAnalysisForm((prev) => ({ ...prev, redFolderNews: event.target.value === 'yes' }))}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label>
                News impact
                <select
                  value={analysisForm.newsImpact}
                  onChange={(event) => setAnalysisForm((prev) => ({ ...prev, newsImpact: event.target.value as Impact }))}
                >
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label>
                Current trend
                <select
                  value={analysisForm.currentTrend}
                  onChange={(event) => setAnalysisForm((prev) => ({ ...prev, currentTrend: event.target.value as AnalysisDirection }))}
                >
                  <option value="bullish">Bullish</option>
                  <option value="bearish">Bearish</option>
                  <option value="consolidation">Consolidation</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>
            <label>
              Price action notes
              <textarea rows={2} value={analysisForm.priceActionNotes} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, priceActionNotes: event.target.value }))} />
            </label>
            <label>
              News notes
              <textarea rows={2} value={analysisForm.newsNotes} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, newsNotes: event.target.value }))} />
            </label>
          </fieldset>

          <fieldset>
            <legend>Pullback / Trading Notes</legend>
            <div className="grid-3">
              <label>
                Sell RSI level (overbought)
                <input value={analysisForm.sellRsiLevel} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, sellRsiLevel: event.target.value }))} />
              </label>
              <label>
                Buy RSI level (oversold)
                <input value={analysisForm.buyRsiLevel} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, buyRsiLevel: event.target.value }))} />
              </label>
              <label>
                Has a clear trend
                <select
                  value={analysisForm.hasClearTrend ? 'yes' : 'no'}
                  onChange={(event) => setAnalysisForm((prev) => ({ ...prev, hasClearTrend: event.target.value === 'yes' }))}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>
            <div className="grid-3">
              <label>
                Directional bias
                <select
                  value={analysisForm.directionalBias}
                  onChange={(event) => setAnalysisForm((prev) => ({ ...prev, directionalBias: event.target.value as AnalysisFormState['directionalBias'] }))}
                >
                  <option value="bullish">Bullish</option>
                  <option value="bearish">Bearish</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label>
                Trading style
                <select
                  value={analysisForm.tradingStyle}
                  onChange={(event) => setAnalysisForm((prev) => ({ ...prev, tradingStyle: event.target.value as AnalysisFormState['tradingStyle'] }))}
                >
                  <option value="trend">Trend</option>
                  <option value="consolidation">Consolidation</option>
                </select>
              </label>
            </div>
            <label>
              Trading notes
              <textarea rows={2} value={analysisForm.tradingNotes} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, tradingNotes: event.target.value }))} />
            </label>
          </fieldset>

          <fieldset>
            <legend>Zones</legend>
            <div className="grid-3">
              <label>Potential sell zone 1<input value={analysisForm.sellZone1} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, sellZone1: event.target.value }))} /></label>
              <label>Potential sell zone 2<input value={analysisForm.sellZone2} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, sellZone2: event.target.value }))} /></label>
              <label>Potential sell zone 3<input value={analysisForm.sellZone3} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, sellZone3: event.target.value }))} /></label>
              <label>Potential buy zone 1<input value={analysisForm.buyZone1} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, buyZone1: event.target.value }))} /></label>
              <label>Potential buy zone 2<input value={analysisForm.buyZone2} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, buyZone2: event.target.value }))} /></label>
              <label>Potential buy zone 3<input value={analysisForm.buyZone3} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, buyZone3: event.target.value }))} /></label>
              <label>Reversal zone 1<input value={analysisForm.reversalZone1} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, reversalZone1: event.target.value }))} /></label>
              <label>Reversal zone 2<input value={analysisForm.reversalZone2} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, reversalZone2: event.target.value }))} /></label>
              <label>Swing zone 1<input value={analysisForm.swingZone1} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, swingZone1: event.target.value }))} /></label>
              <label>Swing zone 2<input value={analysisForm.swingZone2} onChange={(event) => setAnalysisForm((prev) => ({ ...prev, swingZone2: event.target.value }))} /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Market Structure</legend>
            <div className="market-structure-grid">
              {analysisForm.marketStructure.map((row, index) => (
                <div key={row.rangeName} className="market-structure-row">
                  <span>{row.rangeName}</span>
                  <select
                    value={row.bias}
                    onChange={(event) =>
                      setAnalysisForm((prev) => ({
                        ...prev,
                        marketStructure: prev.marketStructure.map((item, itemIndex) => (
                          itemIndex === index
                            ? { ...item, bias: event.target.value as MarketStructureBias }
                            : item
                        )),
                      }))
                    }
                  >
                    <option value="none">None</option>
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                  <input
                    value={row.level}
                    placeholder="Level"
                    onChange={(event) =>
                      setAnalysisForm((prev) => ({
                        ...prev,
                        marketStructure: prev.marketStructure.map((item, itemIndex) => (
                          itemIndex === index
                            ? { ...item, level: event.target.value }
                            : item
                        )),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <div className="form-footer">
            <span />
            <button type="submit" disabled={busy}>Save Market Analysis</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Market Analysis Trends</h2>
        {analysisTrends ? (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <p>Total Analyses</p>
                <h3>{analysisTrends.totalAnalyses}</h3>
              </div>
              <div className="stat-card">
                <p>Avg Completion</p>
                <h3>{analysisTrends.averageCompletionScore}%</h3>
              </div>
              <div className="stat-card">
                <p>Bullish Conclusion Rate</p>
                <h3>{analysisTrends.conclusionMix.bullish ?? 0}%</h3>
              </div>
            </div>

            <h3 className="section-title">Daily Analysis Completion</h3>
            <div className="trend-bars">
              {analysisTrends.dailyCompletion.map((item) => (
                <div key={item.date} className="trend-bar-row">
                  <span>{item.date}</span>
                  <div className="bar-track">
                    <div className="bar-fill analysis" style={{ width: `${item.averageScore}%` }} />
                  </div>
                  <span>{item.averageScore}%</span>
                </div>
              ))}
              {analysisTrends.dailyCompletion.length === 0 && <p>No market analyses yet.</p>}
            </div>

            <h3 className="section-title">Recent Market Analyses</h3>
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Session</th>
                    <th>Pair</th>
                    <th>Conclusion</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {analysisHistory.map((item) => (
                    <tr key={item.id}>
                      <td>{item.tradingDate}</td>
                      <td>{item.sessionName}</td>
                      <td>{item.pair}</td>
                      <td>{item.conclusion}</td>
                      <td>{item.analysisScore}%</td>
                    </tr>
                  ))}
                  {analysisHistory.length === 0 && (
                    <tr>
                      <td colSpan={5}>No analyses in this period.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p>Load data to view analysis trends.</p>
        )}
      </section>

      {error && <p className="error-banner">{error}</p>}
    </main>
  );
}

export default App;
