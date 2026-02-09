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

const outputConfig = {
  apiUrl: (outputs as { custom?: { tradingTrackerApiUrl?: string } }).custom?.tradingTrackerApiUrl
    || (import.meta.env.VITE_TRADING_API_URL as string | undefined)
    || '',
};

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
  const [history, setHistory] = useState<ChecklistItem[]>([]);
  const [trends, setTrends] = useState<TrendResponse | null>(null);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readinessPreview = useMemo(() => {
    const fields = labelLookup.map((item) => form[item.key]);
    const score = Math.round((fields.filter(Boolean).length / fields.length) * 100);
    return score;
  }, [form]);

  useEffect(() => {
    void refresh(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async (windowDays = days) => {
    const [checksRes, trendsRes] = await Promise.all([
      apiCall<{ items: ChecklistItem[] }>(`checks?days=${windowDays}`),
      apiCall<TrendResponse>(`checks/trends?days=${windowDays}`),
    ]);

    setHistory(checksRes.items);
    setTrends(trendsRes);
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
          <h1>Daily Pre-Trade Checklist</h1>
          <p className="subtitle">
            Capture multiple trading readiness snapshots per day, then review trend quality over time.
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
                      checked={form[item.key] as boolean}
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
                Save Capture
              </button>
            </div>
          </form>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>History and Trends</h2>
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

              <h3 className="section-title">Recent Captures</h3>
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

      {error && <p className="error-banner">{error}</p>}
    </main>
  );
}

export default App;
