'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface PushStatusResponse {
  success: boolean;
  authenticatedVia?: 'session' | 'secret';
  subscriptionCount?: number;
  config?: {
    webPushEnabled?: boolean;
    vapidPublicKeyConfigured?: boolean;
    vapidPrivateKeyConfigured?: boolean;
    relayConfigured?: boolean;
  };
  error?: string;
}

interface PushTestResponse {
  success: boolean;
  mode?: string;
  delivered?: number;
  failed?: number;
  prunedStaleSubscriptions?: number;
  subscriptions?: Array<{ id: string }>;
  error?: string;
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
        ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
      }`}
    >
      {label}: {ok ? 'OK' : 'Missing'}
    </span>
  );
}

export default function AdminPushToolsPage() {
  const [secret, setSecret] = useState('');
  const [savedSecret, setSavedSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<PushStatusResponse | null>(null);
  const [message, setMessage] = useState('');

  const [title, setTitle] = useState('Recoder test notification');
  const [body, setBody] = useState('This is a direct push test.');
  const [url, setUrl] = useState('/dashboard');
  const [maxTargets, setMaxTargets] = useState(25);

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (savedSecret) h['x-admin-secret'] = savedSecret;
    return h;
  }, [savedSecret]);

  useEffect(() => {
    const stored = localStorage.getItem('admin_push_secret');
    if (stored) {
      setSecret(stored);
      setSavedSecret(stored);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/push/test', {
        headers,
        cache: 'no-store',
      });
      const data = (await res.json()) as PushStatusResponse;
      setStatus(data);
      if (!res.ok) {
        setMessage(data.error || `Failed with HTTP ${res.status}`);
      }
    } catch {
      setMessage('Failed to load push status');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function runTest(dryRun: boolean) {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          dryRun,
          transport: 'direct',
          title,
          body,
          url,
          maxTargets,
        }),
      });
      const data = (await res.json()) as PushTestResponse;
      if (!res.ok || !data.success) {
        setMessage(data.error || `Push test failed (HTTP ${res.status})`);
        return;
      }

      if (dryRun) {
        setMessage(`Dry run matched ${data.subscriptions?.length ?? 0} subscriptions.`);
      } else {
        setMessage(
          `Direct send complete. Delivered ${data.delivered ?? 0}, failed ${data.failed ?? 0}, pruned ${data.prunedStaleSubscriptions ?? 0}.`
        );
      }
      await loadStatus();
    } catch {
      setMessage('Network error while executing push test');
    } finally {
      setLoading(false);
    }
  }

  function handleSecretSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = secret.trim();
    if (!value) return;
    localStorage.setItem('admin_push_secret', value);
    setSavedSecret(value);
  }

  function clearSecret() {
    localStorage.removeItem('admin_push_secret');
    setSavedSecret(null);
    setSecret('');
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Push Tools</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Validate push config and run direct delivery tests.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/kpi"
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:border-white/20 hover:text-white"
            >
              KPI
            </Link>
            {savedSecret && (
              <button
                onClick={clearSecret}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-500 hover:border-red-400/30 hover:text-red-400"
              >
                Clear Secret
              </button>
            )}
          </div>
        </div>

        {!savedSecret && (
          <form onSubmit={handleSecretSubmit} className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <label htmlFor="admin-secret" className="mb-2 block text-sm text-zinc-400">
              Optional admin secret (if you are not logged in as admin)
            </label>
            <div className="flex gap-2">
              <input
                id="admin-secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="ADMIN_SECRET"
                className="flex-1 rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-600 focus:border-white/30 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
              >
                Save
              </button>
            </div>
          </form>
        )}

        <div className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Status</h2>
              <button
                onClick={() => void loadStatus()}
                disabled={loading}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:border-white/20 hover:text-white disabled:opacity-40"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            <div className="mb-4 text-sm text-zinc-400">
              Auth via: {status?.authenticatedVia || 'unknown'} | Subscriptions:{' '}
              {typeof status?.subscriptionCount === 'number' ? status.subscriptionCount : '-'}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge ok={Boolean(status?.config?.webPushEnabled)} label="Web Push" />
              <Badge ok={Boolean(status?.config?.vapidPublicKeyConfigured)} label="VAPID Public" />
              <Badge ok={Boolean(status?.config?.vapidPrivateKeyConfigured)} label="VAPID Private" />
              <Badge ok={Boolean(status?.config?.relayConfigured)} label="Relay" />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">Direct Test</h2>
            <div className="space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-600 focus:border-white/30 focus:outline-none"
              />
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Body"
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-600 focus:border-white/30 focus:outline-none"
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/dashboard"
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-600 focus:border-white/30 focus:outline-none"
              />
              <input
                type="number"
                min={1}
                max={100}
                value={maxTargets}
                onChange={(e) => setMaxTargets(Number(e.target.value || 25))}
                placeholder="25"
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-600 focus:border-white/30 focus:outline-none"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void runTest(true)}
                disabled={loading}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:border-white/20 hover:text-white disabled:opacity-40"
              >
                Dry Run
              </button>
              <button
                onClick={() => void runTest(false)}
                disabled={loading}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40"
              >
                Send Direct Test
              </button>
            </div>
          </div>

          {message && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
