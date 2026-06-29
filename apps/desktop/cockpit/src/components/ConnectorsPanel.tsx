/**
 * ConnectorsPanel — the social-channel surface: live per-channel connector health
 * polled from GET /api/connectors (NOTE: mounted at /api/connectors, NOT
 * /api/conductor). This lists all 7 channels the connectors gateway knows about,
 * each with a TRUTHFUL status chip derived from the real probe result.
 *
 * Truthful by construction. Each row's chip is one of four honest states
 * (connectors-state.ts):
 *   - live              : configured AND a real probe reported connected.
 *   - requires external : configured but needs an out-of-process dependency.
 *   - config only       : configured (credentials present) but not connected.
 *   - unconfigured      : no credentials present (inert) + the gateway's reason.
 * We never render a fabricated "connected" row: 'live' requires a real
 * connected probe. When the gateway is inert the endpoint still reports every
 * channel as unconfigured-with-reason, so the panel tells the whole truth.
 *
 * Errors are surfaced distinctly: a backend-unreachable / unauthorized / route
 * error renders the real message instead of an empty "all good" panel.
 */
import { api } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import {
  channelReason,
  channelStatus,
  channelStatusLabel,
  channelStatusTone,
  summarizeChannels,
} from '../lib/connectors-state';
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
  const status = channelStatus(ch);
  const tone = channelStatusTone(status);
  const reason = channelReason(ch);
  const account = ch.accountId && ch.accountId !== ch.channel ? ch.accountId : undefined;
  return (
    <div class="connector-row">
      <div class="connector-row-main">
        <span class={`pill pill-${status === 'live' ? 'good' : 'bad'}`}>
          <span class="pill-dot" /> {ch.channel}
        </span>
        <span class={`badge tone-${tone}`}>{channelStatusLabel(status)}</span>
        {account && (
          <span class="connector-account" title={account}>
            {account}
          </span>
        )}
        {ch.identity && <span class="connector-identity">as {ch.identity}</span>}
      </div>
      <div class="connector-row-meta">
        {reason && (
          <span class="connector-error" title={reason}>
            {reason}
          </span>
        )}
        {ch.checkedAt && <span class="connector-checked">probed {checkedAgo(ch.checkedAt)}</span>}
      </div>
    </div>
  );
}

export function ConnectorsPanel() {
  const conn = usePoll(() => api.connectors(), POLL_MS);
  const health = conn.data;
  const channels = health?.channels ?? [];
  const summary = summarizeChannels(channels);

  return (
    <div class="connectors-panel">
      <div class="panel-head">
        <h2 class="panel-title">Chat</h2>
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

      {channels.length > 0 && (
        <div class="connector-summary">
          <span class="badge tone-good">{summary.live} live</span>
          <span class="badge tone-warn">{summary['requires-external']} requires external</span>
          <span class="badge tone-progress">{summary['config-only']} config only</span>
          <span class="badge tone-neutral">{summary.unconfigured} unconfigured</span>
        </div>
      )}

      {conn.error ? (
        <div class="banner banner-warn">
          <strong>Connectors health unavailable:</strong> {conn.error.message}
        </div>
      ) : conn.loading && !health ? (
        <div class="panel-empty">Loading connector health…</div>
      ) : channels.length === 0 ? (
        <div class="panel-empty">
          <p>No channels reported.</p>
          <p class="panel-empty-sub">
            The connectors gateway is inert and reported no channels. Configure a channel credential (e.g.
            <code> CONNECTORS_TELEGRAM_TOKEN</code>) to bridge a chat channel into the Conductor.
          </p>
        </div>
      ) : (
        <div class="connector-list">
          {channels.map((ch) => (
            <ChannelRow ch={ch} key={`${ch.channel}:${ch.accountId ?? ch.channel}`} />
          ))}
        </div>
      )}
    </div>
  );
}
