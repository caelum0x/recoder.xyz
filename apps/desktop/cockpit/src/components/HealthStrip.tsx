/**
 * HealthStrip — the engine/health strip: runtimes + substrates + connectors,
 * polled live from GET /api/conductor/runtimes, /api/conductor/substrates, and
 * GET /api/connectors. Truthful: shows exactly which agent CLIs are installed,
 * which execution substrates are registered/available, and which chat-channel
 * connectors are configured/connected. No fabricated "all good" state — each
 * group surfaces its real error or empty state.
 *
 * To keep the cockpit calm (the operator asked for simple, not busy), the strip
 * is collapsed by default to one quiet summary line — "Runtimes 2/3 · Substrates
 * 1/1 · Channels 0/0" — and only expands the full chip rails on demand. The
 * underlying polling and per-item truth are unchanged; collapsing only hides the
 * chips, it never fabricates or rounds away a real error.
 */
import { useState } from 'preact/hooks';
import { api } from '../lib/api';
import { usePoll } from '../lib/usePoll';

const POLL_MS = 10_000;

/** A truthful 1-line count for a health group: ready / total, or its error/empty. */
interface GroupSummary {
  ready: number;
  total: number;
  /** Real error message when the source failed; null otherwise. */
  error: string | null;
  /** True while the first poll is still in flight. */
  loading: boolean;
}

function summaryLabel(s: GroupSummary): string {
  if (s.error) return 'unavailable';
  if (s.loading) return '…';
  return `${s.ready}/${s.total}`;
}

/** Tone for the summary dot: bad on error, good when all ready, else muted. */
function summaryTone(s: GroupSummary): string {
  if (s.error) return 'sumdot-bad';
  if (s.loading || s.total === 0) return 'sumdot-neutral';
  return s.ready === s.total ? 'sumdot-good' : 'sumdot-warn';
}

export function HealthStrip() {
  const [expanded, setExpanded] = useState(false);
  const runtimes = usePoll(() => api.runtimes(), POLL_MS);
  const substrates = usePoll(() => api.substrates(), POLL_MS);
  const connectors = usePoll(() => api.connectors(), POLL_MS);
  const connectorChannels = connectors.data?.channels ?? [];

  const runtimeSummary: GroupSummary = {
    ready: runtimes.data?.filter((r) => r.available).length ?? 0,
    total: runtimes.data?.length ?? 0,
    error: runtimes.error ? runtimes.error.message : null,
    loading: !runtimes.data && !runtimes.error,
  };
  const substrateSummary: GroupSummary = {
    ready: substrates.data?.filter((s) => s.available).length ?? 0,
    total: substrates.data?.length ?? 0,
    error: substrates.error ? substrates.error.message : null,
    loading: !substrates.data && !substrates.error,
  };
  const connectorSummary: GroupSummary = {
    ready: connectorChannels.filter((c) => c.connected).length,
    total: connectorChannels.length,
    error: connectors.error ? connectors.error.message : null,
    loading: !connectors.data && !connectors.error,
  };

  return (
    <div class={`health-strip ${expanded ? 'health-strip-open' : ''}`}>
      <button
        class="health-summary"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        title={expanded ? 'Hide engine detail' : 'Show engine detail'}
      >
        <span class="health-sum-item">
          <span class={`health-sum-dot ${summaryTone(runtimeSummary)}`} />
          Runtimes <span class="health-sum-count">{summaryLabel(runtimeSummary)}</span>
        </span>
        <span class="health-sum-item">
          <span class={`health-sum-dot ${summaryTone(substrateSummary)}`} />
          Substrates <span class="health-sum-count">{summaryLabel(substrateSummary)}</span>
        </span>
        <span class="health-sum-item">
          <span class={`health-sum-dot ${summaryTone(connectorSummary)}`} />
          Channels <span class="health-sum-count">{summaryLabel(connectorSummary)}</span>
        </span>
        <span class="health-sum-chevron">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div class="health-detail">
          <div class="health-group">
            <span class="health-group-label">Runtimes</span>
            {runtimes.error ? (
              <span class="health-error">unavailable: {runtimes.error.message}</span>
            ) : runtimes.data ? (
              runtimes.data.map((r) => (
                <span class={`pill ${r.available ? 'pill-good' : 'pill-bad'}`} key={r.runtimeId} title={r.path || r.bin}>
                  <span class="pill-dot" /> {r.runtimeId}
                </span>
              ))
            ) : (
              <span class="health-loading">loading…</span>
            )}
          </div>

          <div class="health-group">
            <span class="health-group-label">Substrates</span>
            {substrates.error ? (
              <span class="health-error">unavailable: {substrates.error.message}</span>
            ) : substrates.data ? (
              substrates.data.length === 0 ? (
                <span class="health-loading">none registered</span>
              ) : (
                substrates.data.map((s) => (
                  <span
                    class={`pill ${s.available ? 'pill-good' : 'pill-bad'}`}
                    key={s.id}
                    title={s.reason || s.id}
                  >
                    <span class="pill-dot" /> {s.id}
                  </span>
                ))
              )
            ) : (
              <span class="health-loading">loading…</span>
            )}
          </div>

          <div class="health-group">
            <span class="health-group-label">Connectors</span>
            {connectors.error ? (
              <span class="health-error">unavailable: {connectors.error.message}</span>
            ) : connectors.data ? (
              connectorChannels.length === 0 ? (
                <span class="health-loading">no channels configured</span>
              ) : (
                connectorChannels.map((c) => (
                  <span
                    class={`pill ${c.connected ? 'pill-good' : 'pill-bad'}`}
                    key={`${c.channel}:${c.accountId}`}
                    title={c.error || (c.connected ? 'connected' : c.configured ? 'configured (not connected)' : 'not configured')}
                  >
                    <span class="pill-dot" /> {c.channel}
                  </span>
                ))
              )
            ) : (
              <span class="health-loading">loading…</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
