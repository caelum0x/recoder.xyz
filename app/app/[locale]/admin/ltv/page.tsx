'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { LtvReport } from '@/lib/analytics/ltv';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LtvResponse {
  success: boolean;
  report: LtvReport;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min

export default function LtvDashboard() {
  const [secret, setSecret] = useState('');
  const [savedSecret, setSavedSecret] = useState<string | null>(null);
  const [report, setReport] = useState<LtvReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('admin_kpi_secret');
    if (stored) {
      setSavedSecret(stored);
      setSecret(stored);
    }
  }, []);

  const fetchLtv = useCallback(async (s: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ltv', {
        headers: { 'x-admin-secret': s },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setReport((json as LtvResponse).report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load LTV data');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!savedSecret) return;
    fetchLtv(savedSecret);
    const interval = setInterval(() => fetchLtv(savedSecret), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [savedSecret, fetchLtv]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = secret.trim();
    if (!trimmed) return;
    localStorage.setItem('admin_kpi_secret', trimmed);
    setSavedSecret(trimmed);
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_kpi_secret');
    setSavedSecret(null);
    setReport(null);
    setSecret('');
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">LTV by Channel</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Revenue grouped by acquisition source (recorded data only)
            </p>
          </div>
          {savedSecret && (
            <div className="flex items-center gap-3">
              <Link
                href="/admin/kpi"
                className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 transition"
              >
                KPI Dashboard
              </Link>
              {report && (
                <span className="text-[11px] text-zinc-600">
                  Updated {new Date(report.generatedAt).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={() => fetchLtv(savedSecret)}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 transition disabled:opacity-40"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
              <button
                onClick={handleLogout}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-zinc-500 hover:text-red-400 hover:border-red-400/30 transition"
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Auth gate */}
        {!savedSecret && (
          <form onSubmit={handleSubmit} className="max-w-md mx-auto mt-32">
            <label htmlFor="secret" className="block text-sm text-zinc-400 mb-2">
              Admin secret
            </label>
            <div className="flex gap-2">
              <input
                id="secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                placeholder="x-admin-secret"
                autoComplete="off"
              />
              <button
                type="submit"
                className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:border-white/30 transition"
              >
                View
              </button>
            </div>
          </form>
        )}

        {error && savedSecret && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {savedSecret && report && (
          <div className="flex flex-col gap-8">
            {/* Totals */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard label="Signups" value={report.totals.signups} />
              <StatCard label="Paying users" value={report.totals.payingUsers} />
              <StatCard
                label="Recorded revenue"
                value={report.totals.recordedRevenue}
                prefix="$"
              />
            </div>

            {/* Honest empty state */}
            {!report.hasRevenue && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
                <p className="text-zinc-300 font-medium">
                  No recorded revenue events yet
                </p>
                <p className="text-sm text-zinc-500 mt-2">
                  Metrics populate as real signups and payments accrue. For full
                  event-level CAC/LTV, configure{' '}
                  <code className="text-zinc-400">ANALYTICS_INGEST_URL</code> with
                  a real event store.
                </p>
              </div>
            )}

            {/* Per-channel table */}
            {report.channels.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-zinc-500">
                      <th className="px-4 py-3 font-medium">Channel</th>
                      <th className="px-4 py-3 font-medium text-right">Signups</th>
                      <th className="px-4 py-3 font-medium text-right">Paying</th>
                      <th className="px-4 py-3 font-medium text-right">Revenue</th>
                      <th className="px-4 py-3 font-medium text-right">Rev / user</th>
                      <th className="px-4 py-3 font-medium text-right">CAC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.channels.map((c) => (
                      <tr key={c.channel} className="border-b border-white/5 last:border-0">
                        <td className="px-4 py-3 text-white">{c.channel}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                          {c.signups.toLocaleString('en-US')}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                          {c.payingUsers.toLocaleString('en-US')}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-white">
                          ${c.recordedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                          ${c.avgRevenuePerUser.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td
                          className="px-4 py-3 text-right text-zinc-600"
                          title={c.cacNote}
                        >
                          n/a
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Honesty notes */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
                Data source &amp; caveats
              </p>
              <p className="text-[11px] text-zinc-600 mb-3">
                Source: {report.dataSource}
              </p>
              <ul className="flex flex-col gap-2 text-sm text-zinc-400 list-disc pl-5">
                {report.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  prefix,
}: {
  label: string;
  value: number;
  prefix?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="text-2xl font-semibold text-white tabular-nums">
        {prefix}
        {value.toLocaleString('en-US', {
          maximumFractionDigits: prefix === '$' ? 2 : 0,
          minimumFractionDigits: prefix === '$' ? 2 : 0,
        })}
      </span>
    </div>
  );
}
