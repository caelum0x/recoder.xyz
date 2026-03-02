'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KPIData {
  success: boolean;
  generatedAt: string;
  weekStart: string;
  metrics: {
    users: {
      total: number;
      thisWeek: number;
      lastWeek: number;
      growthPct: number | null;
      web: { total: number; thisWeek: number; lastWeek: number; growthPct: number | null };
      cli: {
        total: number;
        thisWeek: number;
        lastWeek: number;
        uniqueThisWeek: number;
        growthPct: number | null;
      };
      combinedSignups: { thisWeek: number; lastWeek: number; growthPct: number | null };
    };
    engagement: {
      cliSessions: { thisWeek: number; uniqueUsers: number };
      webSessions: { thisWeek: number };
      apiKeys: { active: number };
      projects: { thisWeek: number; lastWeek: number; growthPct: number | null };
    };
    revenue: {
      activeSubscriptions: number;
      newThisWeek: number;
      mrrEstimate: number;
      paidUsers: number;
    };
    email: {
      newsletter: { activeSubscribers: number; newThisWeek: number };
      scheduled: { sentThisWeek: number; failedThisWeek: number; pending: number };
    };
  };
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  delta,
  suffix,
  sub,
}: {
  label: string;
  value: number | string;
  delta?: number | null;
  suffix?: string;
  sub?: string;
}) {
  const formatted =
    typeof value === 'number'
      ? value.toLocaleString('en-US', {
          maximumFractionDigits: suffix === '$' ? 2 : 0,
        })
      : value;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-1 hover:border-white/20 transition-colors">
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold text-white tabular-nums">
          {suffix === '$' && '$'}
          {formatted}
          {suffix && suffix !== '$' && <span className="text-base text-zinc-400 ml-0.5">{suffix}</span>}
        </span>
        {delta !== undefined && delta !== null && (
          <span
            className={`text-xs font-medium flex items-center gap-0.5 mb-0.5 ${
              delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-zinc-500'
            }`}
          >
            {delta > 0 ? '\u2191' : delta < 0 ? '\u2193' : '\u2192'}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {sub && <span className="text-[11px] text-zinc-600">{sub}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-2 animate-pulse">
      <div className="h-3 w-20 rounded bg-zinc-800" />
      <div className="h-7 w-28 rounded bg-zinc-800" />
      <div className="h-2 w-16 rounded bg-zinc-800" />
    </div>
  );
}

function SectionSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min

export default function KPIDashboard() {
  const [secret, setSecret] = useState('');
  const [savedSecret, setSavedSecret] = useState<string | null>(null);
  const [data, setData] = useState<KPIData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Restore secret from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('admin_kpi_secret');
    if (stored) {
      setSavedSecret(stored);
      setSecret(stored);
    }
  }, []);

  // Fetch
  const fetchKPI = useCallback(async (s: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/kpi', {
        headers: { 'x-admin-secret': s },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setData(json as KPIData);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load KPI data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch when secret is set
  useEffect(() => {
    if (!savedSecret) return;
    fetchKPI(savedSecret);
    const interval = setInterval(() => fetchKPI(savedSecret), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [savedSecret, fetchKPI]);

  // Submit secret
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
    setData(null);
    setSecret('');
  };

  const m = data?.metrics;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">KPI Dashboard</h1>
            <p className="text-sm text-zinc-500 mt-1">Weekly metrics at a glance</p>
          </div>
          {savedSecret && (
            <div className="flex items-center gap-3">
              <Link
                href="/admin/push"
                className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 transition"
              >
                Push Tools
              </Link>
              {data && (
                <span className="text-[11px] text-zinc-600">
                  Updated {new Date(data.generatedAt).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={() => fetchKPI(savedSecret)}
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
                placeholder="Enter ADMIN_SECRET"
                autoFocus
                className="flex-1 rounded-lg bg-zinc-900 border border-white/10 px-4 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/30"
              />
              <button
                type="submit"
                className="rounded-lg bg-white text-black px-5 py-2 text-sm font-medium hover:bg-zinc-200 transition"
              >
                Go
              </button>
            </div>
          </form>
        )}

        {/* Error */}
        {error && savedSecret && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400 mb-6">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && savedSecret && (
          <div className="space-y-8">
            <Section title="Users">
              <SectionSkeleton count={6} />
            </Section>
            <Section title="Engagement">
              <SectionSkeleton count={5} />
            </Section>
            <Section title="Revenue">
              <SectionSkeleton count={4} />
            </Section>
            <Section title="Email">
              <SectionSkeleton count={5} />
            </Section>
          </div>
        )}

        {/* Data */}
        {m && savedSecret && (
          <div className="space-y-10">
            {/* USERS */}
            <Section title="Users">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Total Users"
                  value={m.users.total}
                  delta={m.users.growthPct}
                  sub={`${m.users.thisWeek} this week`}
                />
                <StatCard
                  label="Web Users (Better Auth)"
                  value={m.users.web.total}
                  delta={m.users.web.growthPct}
                  sub={`${m.users.web.thisWeek} new this week`}
                />
                <StatCard
                  label="CLI Users"
                  value={m.users.cli.total}
                  delta={m.users.cli.growthPct}
                  sub={`${m.users.cli.uniqueThisWeek} active this week`}
                />
                <StatCard
                  label="Signups This Week"
                  value={m.users.combinedSignups.thisWeek}
                  delta={m.users.combinedSignups.growthPct}
                  sub={`vs ${m.users.combinedSignups.lastWeek} last week`}
                />
              </div>
            </Section>

            {/* ENGAGEMENT */}
            <Section title="Engagement">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="CLI Sessions This Week"
                  value={m.engagement.cliSessions.thisWeek}
                  sub={`${m.engagement.cliSessions.uniqueUsers} unique users`}
                />
                <StatCard
                  label="Web Sessions This Week"
                  value={m.engagement.webSessions.thisWeek}
                />
                <StatCard
                  label="Active API Keys"
                  value={m.engagement.apiKeys.active}
                />
                <StatCard
                  label="Projects This Week"
                  value={m.engagement.projects.thisWeek}
                  delta={m.engagement.projects.growthPct}
                  sub={`vs ${m.engagement.projects.lastWeek} last week`}
                />
              </div>
            </Section>

            {/* REVENUE */}
            <Section title="Revenue">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Active Subscriptions"
                  value={m.revenue.activeSubscriptions}
                  sub={`${m.revenue.newThisWeek} new this week`}
                />
                <StatCard
                  label="MRR Estimate"
                  value={m.revenue.mrrEstimate}
                  suffix="$"
                />
                <StatCard
                  label="Paid Users"
                  value={m.revenue.paidUsers}
                  sub="non-free plans"
                />
              </div>
            </Section>

            {/* EMAIL */}
            <Section title="Email">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Newsletter Subscribers"
                  value={m.email.newsletter.activeSubscribers}
                  sub={`${m.email.newsletter.newThisWeek} new this week`}
                />
                <StatCard
                  label="Emails Sent This Week"
                  value={m.email.scheduled.sentThisWeek}
                />
                <StatCard
                  label="Emails Failed"
                  value={m.email.scheduled.failedThisWeek}
                  sub={m.email.scheduled.failedThisWeek > 0 ? 'check logs' : 'all clear'}
                />
                <StatCard
                  label="Emails Pending"
                  value={m.email.scheduled.pending}
                  sub="in queue"
                />
              </div>
            </Section>

            {/* Footer */}
            <div className="text-[11px] text-zinc-700 text-center pt-4 border-t border-white/5">
              Week starting {new Date(data!.weekStart).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              {' \u00b7 '}
              Auto-refreshes every 5 min
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">{title}</h2>
      {children}
    </section>
  );
}
