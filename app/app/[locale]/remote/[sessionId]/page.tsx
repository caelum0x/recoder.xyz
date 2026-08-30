'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/session-provider';
import styles from './remote.module.css';

type Capability = 'monitor' | 'steer';
type AttentionState =
  | 'awaiting_approval'
  | 'agent_idle_prompt'
  | 'review_ready'
  | 'working'
  | 'error'
  | 'unknown';

type RemoteSession = {
  sessionId: string;
  scope: { workspaceIds?: string[]; taskGroup?: string };
  capabilities: Capability[];
  issuedAt: string;
  expiresAt: string;
  durable?: boolean;
};

type StatusCell = {
  workspaceId: string;
  agentKind: string;
  taskGroup?: string;
  nativeStatus: string;
};

type StatusSnapshot = {
  columns: Record<AttentionState, StatusCell[]>;
  totals: Record<AttentionState, number>;
  total: number;
  degraded: boolean;
  reason?: string;
};

type SteerResult =
  | { status: 'delivered'; workspaceId: string; auditId: string | null }
  | { status: 'needs_approval'; requestId: string; reason: string }
  | { status: 'refused'; reason: string };

type StreamState = 'connecting' | 'live' | 'reconnecting' | 'unavailable';

const COLUMN_ORDER: AttentionState[] = [
  'awaiting_approval',
  'agent_idle_prompt',
  'review_ready',
  'working',
  'error',
  'unknown',
];

const LABELS: Record<AttentionState, string> = {
  awaiting_approval: 'Approval',
  agent_idle_prompt: 'Needs input',
  review_ready: 'Review ready',
  working: 'Working',
  error: 'Error',
  unknown: 'Unknown',
};

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const value = payload as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof value.error === 'string') return value.error;
    if (value.error && typeof value.error.message === 'string')
      return value.error.message;
    if (typeof value.message === 'string') return value.message;
  }
  return fallback;
}

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    data?: T;
    error?: unknown;
    message?: string;
  } | null;
  if (!response.ok) {
    throw new Error(
      errorMessage(payload, `Request failed (${response.status})`)
    );
  }
  if (!payload?.data)
    throw new Error('Remote continuity returned an incomplete response.');
  return payload.data;
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function formatMoment(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export default function RemoteReceiverPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: identity, isPending: identityPending } = useSession();
  const sessionId = params.sessionId;
  const apiOrigin = searchParams.get('api')?.trim() || '';
  const remotePath = useCallback(
    (suffix = '') => {
      const path = `/api/remote/sessions/${encodeURIComponent(sessionId)}${suffix}`;
      return apiOrigin ? `${path}?api=${encodeURIComponent(apiOrigin)}` : path;
    },
    [apiOrigin, sessionId]
  );
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [streamState, setStreamState] = useState<StreamState>('connecting');

  useEffect(() => {
    if (!identityPending && !identity) {
      const current = `${window.location.pathname}${window.location.search}`;
      router.replace(`/auth/signin?redirect=${encodeURIComponent(current)}`);
    }
  }, [identity, identityPending, router]);

  const refreshSnapshot = useCallback(
    async (quiet = false) => {
      if (!sessionId || ended) return;
      if (!quiet) setRefreshing(true);
      try {
        const data = await requestData<{ snapshot: StatusSnapshot }>(
          remotePath('/snapshot')
        );
        setSnapshot(data.snapshot);
        setUpdatedAt(new Date());
        setError('');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!quiet) setRefreshing(false);
      }
    },
    [ended, remotePath, sessionId]
  );

  useEffect(() => {
    if (identityPending || !identity || !sessionId) return;
    let cancelled = false;
    void Promise.all([
      requestData<{ session: RemoteSession }>(remotePath()),
      requestData<{ snapshot: StatusSnapshot }>(remotePath('/snapshot')),
    ])
      .then(([sessionData, snapshotData]) => {
        if (cancelled) return;
        setSession(sessionData.session);
        setSnapshot(snapshotData.snapshot);
        setUpdatedAt(new Date());
        setError('');
      })
      .catch(caught => {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identity, identityPending, remotePath, sessionId]);

  useEffect(() => {
    if (!session || ended) return;
    if (typeof EventSource === 'undefined') {
      setStreamState('unavailable');
      return;
    }
    const source = new EventSource(remotePath('/stream'), {
      withCredentials: true,
    });
    setStreamState('connecting');
    source.onopen = () => setStreamState('live');
    source.onmessage = event => {
      try {
        const frame = JSON.parse(event.data) as {
          type?: unknown;
          snapshot?: StatusSnapshot;
          at?: unknown;
          reason?: unknown;
        };
        if (
          frame.type === 'snapshot' &&
          frame.snapshot &&
          typeof frame.snapshot.total === 'number'
        ) {
          setSnapshot(frame.snapshot);
          setUpdatedAt(
            typeof frame.at === 'string' ? new Date(frame.at) : new Date()
          );
          setStreamState('live');
          setError('');
          return;
        }
        if (frame.type === 'closed') {
          setStreamState('unavailable');
          setError(
            typeof frame.reason === 'string'
              ? frame.reason
              : 'Remote stream closed.'
          );
          source.close();
        }
      } catch {
        // Ignore malformed frames; the last authoritative snapshot stays visible.
      }
    };
    source.onerror = () => setStreamState('reconnecting');
    return () => source.close();
  }, [ended, remotePath, session, sessionId]);

  // A slow recovery path only while SSE is unavailable/reconnecting. The normal
  // product path is push-driven; this preserves truthful visibility on older
  // browsers and transient proxy failures without returning to rapid polling.
  useEffect(() => {
    if (
      !session ||
      ended ||
      streamState === 'live' ||
      streamState === 'connecting'
    )
      return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshSnapshot(true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [ended, refreshSnapshot, session, streamState]);

  const panes = useMemo(() => {
    if (!snapshot) return [];
    return COLUMN_ORDER.flatMap(attention =>
      (snapshot.columns[attention] || []).map(cell => ({ attention, ...cell }))
    );
  }, [snapshot]);

  useEffect(() => {
    if (!panes.length) {
      setSelectedWorkspace('');
      return;
    }
    if (!panes.some(pane => pane.workspaceId === selectedWorkspace)) {
      setSelectedWorkspace(panes[0].workspaceId);
    }
  }, [panes, selectedWorkspace]);

  const canSteer = session?.capabilities.includes('steer') === true;

  const steer = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedWorkspace || !instruction.trim() || sending) return;
    setSending(true);
    setOutcome('');
    setError('');
    try {
      const data = await requestData<{ result: SteerResult }>(
        remotePath(
          `/workspaces/${encodeURIComponent(selectedWorkspace)}/steer`
        ),
        { method: 'POST', body: JSON.stringify({ input: instruction.trim() }) }
      );
      if (data.result.status === 'delivered') {
        setOutcome(
          data.result.auditId
            ? `Delivered · audit ${shortId(data.result.auditId)}`
            : 'Delivered · audit unavailable'
        );
        setInstruction('');
      } else if (data.result.status === 'needs_approval') {
        setOutcome(
          `Approval ${shortId(data.result.requestId)} opened · input not delivered`
        );
      } else {
        setOutcome(`Refused · ${data.result.reason}`);
      }
      void refreshSnapshot(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSending(false);
    }
  };

  const endSession = async () => {
    if (ending) return;
    setEnding(true);
    setError('');
    try {
      await requestData<{ revoked: true }>(remotePath(), { method: 'DELETE' });
      setEnded(true);
      setSession(null);
      setSnapshot(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setEnding(false);
    }
  };

  if (identityPending || loading) {
    return (
      <div className={styles.loading}>
        <span>Connecting to live work…</span>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark}>
          REC/REMOTE
        </Link>
        <div className={styles.identity}>
          <span className={styles.liveDot} aria-hidden="true" />
          {identity?.user.email || 'Signed in'}
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.kicker}>
            Remote continuity / {shortId(sessionId)}
          </div>
          <div
            className={styles.count}
            aria-label={`${snapshot?.total || 0} live panes`}
          >
            {snapshot?.total ?? '—'}
          </div>
          <div className={styles.heroCopy}>
            <h1>
              Live panes.
              <br />
              One signed-in view.
            </h1>
            <p>
              {ended
                ? 'This remote session has ended.'
                : snapshot?.degraded
                  ? snapshot.reason || 'The live pane source is degraded.'
                  : `${snapshot?.total || 0} pane${snapshot?.total === 1 ? '' : 's'} inside this session’s owner-checked scope.`}
            </p>
          </div>
          <div className={styles.sessionMeta}>
            <span>{session?.durable ? 'DURABLE' : 'PROCESS-BOUND'}</span>
            <span>
              {session
                ? session.capabilities.join(' + ').toUpperCase()
                : 'NO ACCESS'}
            </span>
            <span>
              {session ? `EXPIRES ${formatMoment(session.expiresAt)}` : 'ENDED'}
            </span>
          </div>
        </section>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {!ended && snapshot && (
          <section className={styles.board} aria-label="Live agent panes">
            <div className={styles.sectionHead}>
              <span>01 / STATUS BOARD</span>
              <button
                type="button"
                onClick={() => void refreshSnapshot()}
                disabled={refreshing}
              >
                {refreshing ? 'REFRESHING' : 'REFRESH NOW'}
              </button>
            </div>

            {panes.length === 0 ? (
              <div className={styles.empty}>
                <strong>No live panes in scope.</strong>
                <span>
                  The receiver is connected and will update when an agent pane
                  appears.
                </span>
              </div>
            ) : (
              <div className={styles.paneGrid}>
                {panes.map((pane, index) => (
                  <button
                    type="button"
                    className={`${styles.pane} ${selectedWorkspace === pane.workspaceId ? styles.selected : ''}`}
                    key={`${pane.attention}:${pane.workspaceId}`}
                    onClick={() => setSelectedWorkspace(pane.workspaceId)}
                    aria-pressed={selectedWorkspace === pane.workspaceId}
                  >
                    <span className={styles.paneNumber}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className={styles.paneBody}>
                      <span className={styles.paneState}>
                        {LABELS[pane.attention]}
                      </span>
                      <strong>{shortId(pane.workspaceId)}</strong>
                      <span>
                        {pane.agentKind} / {pane.nativeStatus}
                      </span>
                      {pane.taskGroup && (
                        <span>group {shortId(pane.taskGroup)}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className={styles.boardFoot}>
              <span>
                {updatedAt
                  ? `UPDATED ${formatMoment(updatedAt.toISOString())}`
                  : 'NOT UPDATED'}
              </span>
              <span>
                {streamState === 'live'
                  ? 'LIVE STREAM'
                  : streamState === 'connecting'
                    ? 'STREAM CONNECTING'
                    : 'RECONNECTING / 15 SEC FALLBACK'}
              </span>
            </div>
          </section>
        )}

        {!ended && canSteer && panes.length > 0 && (
          <section className={styles.steer}>
            <div className={styles.sectionHead}>
              <span>02 / GOVERNED INPUT</span>
              <span>POLICY CHECKED</span>
            </div>
            <form onSubmit={steer} className={styles.steerForm}>
              <label htmlFor="remote-instruction">
                <span>Target / {shortId(selectedWorkspace)}</span>
                <textarea
                  id="remote-instruction"
                  value={instruction}
                  onChange={event => setInstruction(event.target.value)}
                  placeholder="Tell this agent what to do next"
                  rows={4}
                />
              </label>
              <button type="submit" disabled={sending || !instruction.trim()}>
                {sending ? 'CHECKING POLICY…' : 'SEND TO PANE →'}
              </button>
            </form>
            {outcome && (
              <div className={styles.outcome} role="status">
                {outcome}
              </div>
            )}
          </section>
        )}

        <footer className={styles.footer}>
          <p>
            The session ID limits scope. Sign-in, ownership, policy, approvals,
            and audit still apply.
          </p>
          {!ended && (
            <button
              type="button"
              onClick={() => void endSession()}
              disabled={ending}
            >
              {ending ? 'ENDING…' : 'END REMOTE SESSION'}
            </button>
          )}
          {ended && <Link href="/projects">RETURN TO PROJECTS →</Link>}
        </footer>
      </main>
    </div>
  );
}
