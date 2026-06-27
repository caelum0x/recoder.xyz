/**
 * ConnectorsPanel — live chat-channel connector health, polled from
 * GET /api/connectors (NOTE: mounted at /api/connectors, NOT /api/conductor).
 *
 * Truthful by construction: every row is a real per-channel probe result from
 * the connectors gateway (configured? connected?). When no channel is configured
 * the gateway reports `active: false` with an empty `channels` array, and we show
 * a truthful "no channels configured" — never a fabricated/connected row.
 *
 * Errors are surfaced distinctly: a backend-unreachable / unauthorized / route
 * error renders the real message instead of an empty "all good" panel.
 */
import { api } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import type { ChannelHealth } from '../types';

const POLL_MS = 10_000;

function checkedAgo(checkedAt?: number): string {
  if (!checkedAt) return '';
  const secs = Math.max(0, Math.floor((Date.now() - checkedAt) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function ChannelRow({ ch }: { ch: ChannelHealth }) {
  const tone = ch.connected ? 'good' : ch.configured ? 'warn' : 'bad';
  const status = ch.connected ? 'connected' : ch.configured ? 'configured (not connected)' : 'not configured';
  return (
    <div class="connector-row">
      <div class="connector-row-main">
        <span class={`pill pill-${ch.connected ? 'good' : 'bad'}`}>
          <span class="pill-dot" /> {ch.channel}
        </span>
        <span class={`badge tone-${tone}`}>{status}</span>
        <span class="connector-account" title={ch.accountId}>{ch.accountId}</span>
        {ch.identity && <span class="connector-identity">as {ch.identity}</span>}
      </div>
      <div class="connector-row-meta">
        {ch.error && <span class="connector-error" title={ch.error}>{ch.error}</span>}
        {ch.checkedAt && <span class="connector-checked">probed {checkedAgo(ch.checkedAt)}</span>}
      </div>
    </div>
  );
}

export function ConnectorsPanel() {
  const conn = usePoll(() => api.connectors(), POLL_MS);
  const health = conn.data;
  const channels = health?.channels ?? [];

  return (
    <div class="connectors-panel">
      <div class="panel-head">
        <h2 class="panel-title">Connectors</h2>
        <div class="panel-head-actions">
          {health && (
            <>
              <span class={`pill pill-${health.active ? 'good' : 'bad'}`} title="At least one channel configured">
                <span class="pill-dot" /> {health.active ? 'active' : 'inert'}
              </span>
              <span
                class={`pill pill-${health.dispatchReady ? 'good' : 'bad'}`}
                title="Inbound commands can launch a workspace (CONNECTORS_REPO_PATH set)"
              >
                <span class="pill-dot" /> dispatch {health.dispatchReady ? 'ready' : 'off'}
              </span>
            </>
          )}
          <button class="btn btn-ghost btn-sm" onClick={() => conn.refresh()} disabled={conn.loading}>
            {conn.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {conn.error ? (
        <div class="banner banner-warn">
          <strong>Connectors health unavailable:</strong> {conn.error.message}
        </div>
      ) : conn.loading && !health ? (
        <div class="panel-empty">Loading connector health…</div>
      ) : channels.length === 0 ? (
        <div class="panel-empty">
          <p>No channels configured.</p>
          <p class="panel-empty-sub">
            The connectors gateway is inert. Configure a channel credential (e.g.
            <code> CONNECTORS_TELEGRAM_TOKEN</code>) to bridge a chat channel into the Conductor.
          </p>
        </div>
      ) : (
        <div class="connector-list">
          {channels.map((ch) => (
            <ChannelRow ch={ch} key={`${ch.channel}:${ch.accountId}`} />
          ))}
        </div>
      )}
    </div>
  );
}
