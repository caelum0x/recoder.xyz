/**
 * SubstratesPanel — live execution-substrate availability + unified conductor
 * health, polled from REAL routes:
 *   GET /api/conductor/substrates    → [{ id, available, reason? }] per substrate
 *   GET /api/conductor/health/full   → ConductorHealth (substrate+runtimes+resources+tails)
 *
 * Truthful by construction: every substrate row is a real availability probe
 * ({ available, reason }) from the conductor substrate registry — when a
 * substrate is unavailable the operator sees the exact reason (e.g.
 * "DAYTONA_API_KEY not set"), never a fabricated "ready". The health block shows
 * the real status (healthy/degraded/unhealthy), disk headroom, runtimes, tails,
 * and workspace counts. Errors are surfaced distinctly instead of an empty
 * "all good" panel.
 */
import { api } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import type { SubstrateAvailability } from '../types';
import {
  availableRuntimeCount,
  availableSubstrateCount,
  healthStatusTone,
  isDiskLow,
  sortSubstrates,
  substrateLabel,
  substrateTone,
} from '../lib/conductor-health-state';

const SUBSTRATE_POLL_MS = 10_000;
const HEALTH_POLL_MS = 10_000;

function SubstrateRow({ s }: { s: SubstrateAvailability }) {
  const tone = substrateTone(s);
  return (
    <div class="connector-row">
      <div class="connector-row-main">
        <span class={`pill pill-${s.available ? 'good' : 'bad'}`}>
          <span class="pill-dot" /> {substrateLabel(s.id)}
        </span>
        <span class={`badge tone-${tone}`}>{s.available ? 'available' : 'unavailable'}</span>
      </div>
      <div class="connector-row-meta">
        {!s.available && s.reason && (
          <span class="connector-error" title={s.reason}>{s.reason}</span>
        )}
      </div>
    </div>
  );
}

export function SubstratesPanel() {
  const subs = usePoll(() => api.substrates(), SUBSTRATE_POLL_MS);
  const health = usePoll(() => api.healthFull(), HEALTH_POLL_MS);

  const rows = subs.data ? sortSubstrates(subs.data) : [];
  const h = health.data;

  return (
    <div class="connectors-panel substrates-panel">
      <div class="panel-head">
        <h2 class="panel-title">Agents</h2>
        <div class="panel-head-actions">
          {subs.data && (
            <span class="pill pill-good" title="Available substrates / total registered">
              <span class="pill-dot" /> {availableSubstrateCount(subs.data)}/{subs.data.length} substrates
            </span>
          )}
          {h && (
            <span class={`pill pill-${h.status === 'healthy' ? 'good' : 'bad'}`} title="Unified conductor health">
              <span class="pill-dot" /> {h.status}
            </span>
          )}
          <button
            class="btn btn-ghost btn-sm"
            onClick={() => {
              subs.refresh();
              health.refresh();
            }}
            disabled={subs.loading || health.loading}
          >
            {subs.loading || health.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {subs.error ? (
        <div class="banner banner-warn">
          <strong>Substrate availability unavailable:</strong> {subs.error.message}
        </div>
      ) : subs.loading && !subs.data ? (
        <div class="panel-empty">Loading substrate availability…</div>
      ) : rows.length === 0 ? (
        <div class="panel-empty">
          <p>No execution substrates registered.</p>
          <p class="panel-empty-sub">The conductor has no substrate to launch workspaces on.</p>
        </div>
      ) : (
        <div class="connector-list">
          {rows.map((s) => (
            <SubstrateRow s={s} key={s.id} />
          ))}
        </div>
      )}

      <div class="panel-subhead">
        <h3 class="panel-subtitle">Conductor health</h3>
        {h && (
          <span class={`badge tone-${healthStatusTone(h.status)}`}>{h.status}</span>
        )}
      </div>

      {health.error ? (
        <div class="banner banner-warn">
          <strong>Conductor health unavailable:</strong> {health.error.message}
        </div>
      ) : health.loading && !h ? (
        <div class="panel-empty">Loading conductor health…</div>
      ) : h ? (
        <div class="health-grid">
          <div class="health-cell">
            <span class="meta-k">Substrate</span>
            <span class={`badge tone-${h.substrate.available ? 'good' : 'bad'}`}>
              {h.substrate.available ? 'up' : 'down'}
            </span>
            {!h.substrate.available && h.substrate.reason && (
              <span class="connector-error" title={h.substrate.reason}>{h.substrate.reason}</span>
            )}
          </div>
          <div class="health-cell">
            <span class="meta-k">git / tmux</span>
            <span class="meta-v">
              {h.substrate.git ? 'git ✓' : 'git ✗'} · {h.substrate.tmux ? 'tmux ✓' : 'tmux ✗'}
            </span>
          </div>
          <div class="health-cell">
            <span class="meta-k">Runtimes</span>
            <span class="meta-v">{availableRuntimeCount(h)}/{h.runtimes.length} available</span>
          </div>
          <div class="health-cell">
            <span class="meta-k">Free disk</span>
            <span class={`badge tone-${isDiskLow(h) ? 'bad' : 'good'}`}>
              {h.resources.current.freeDiskGb} GB (min {h.resources.limits.minFreeDiskGb})
            </span>
          </div>
          <div class="health-cell">
            <span class="meta-k">Workspaces</span>
            <span class="meta-v">
              {h.resources.current.projectWorkspaces}/{h.resources.limits.maxConcurrentWorkspaces} ·{' '}
              {h.workspaces.active} active / {h.workspaces.total} total
            </span>
          </div>
          <div class="health-cell">
            <span class="meta-k">tmux sessions</span>
            <span class="meta-v">
              {h.resources.current.tmuxSessions}/{h.resources.limits.maxTmuxSessions}
            </span>
          </div>
          <div class="health-cell">
            <span class="meta-k">Active tails</span>
            <span class="meta-v">{h.activeTails}</span>
          </div>
          <div class="health-cell">
            <span class="meta-k">dmux</span>
            <span class={`badge tone-${h.dmux.available ? 'good' : 'neutral'}`}>
              {h.dmux.available ? 'available' : 'absent'}
            </span>
          </div>
          <div class="health-cell health-cell-wide">
            <span class="meta-k">Checked</span>
            <span class="meta-v">{new Date(h.timestamp).toLocaleString()}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
