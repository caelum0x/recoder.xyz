/**
 * BrainStatsPanel — the shared-brain value surface, polled from the REAL route:
 *   GET /api/agent-os/brain/stats → { brain: { enabled, report }, governance }
 * (mounted at /api/agent-os, NOT /api/conductor).
 *
 * Truthful by construction. The headline is derived ENTIRELY from the real
 * response (brain-stats-state.ts):
 *   - disabled  : RECODER_BRAIN_ENABLED is off — no brain was constructed. We say
 *                 "disabled", never "0 tokens saved".
 *   - idle      : enabled but report null / not-yet-read — "nothing reported yet".
 *   - reporting : enabled AND report.available → "saved ~X tokens, N% reuse" from
 *                 the live cache-doctor accounting.
 * The governance block shows the real Merkle audit-chain verification (ok +
 * entry count + tip hash) — a truthful `audit unverified` when it could not be
 * verified, never a fabricated green. Errors are surfaced distinctly instead of
 * an empty "all good" card.
 */
import { api } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import {
  brainDisplayState,
  brainHeadline,
  formatHitRate,
  formatTokens,
  governanceLabel,
  governanceTone,
} from '../lib/brain-stats-state';

const BRAIN_POLL_MS = 15_000;

export function BrainStatsPanel() {
  const stats = usePoll(() => api.brainStats(), BRAIN_POLL_MS);
  const data = stats.data;
  const state = data ? brainDisplayState(data) : null;
  const report = data?.brain.report ?? null;

  return (
    <div class="connectors-panel brain-panel">
      <div class="panel-head">
        <h2 class="panel-title">Brain</h2>
        <div class="panel-head-actions">
          {data && (
            <>
              <span
                class={`pill pill-${data.brain.enabled ? 'good' : 'bad'}`}
                title="RECODER_BRAIN_ENABLED gate"
              >
                <span class="pill-dot" /> brain {data.brain.enabled ? 'enabled' : 'disabled'}
              </span>
              <span
                class={`pill pill-${data.governance.ok ? 'good' : 'bad'}`}
                title="Merkle audit-chain integrity"
              >
                <span class="pill-dot" /> {governanceLabel(data.governance)}
              </span>
            </>
          )}
          <span class="panel-head-note">GET /api/agent-os/brain/stats</span>
          <button class="btn btn-ghost btn-sm" onClick={() => stats.refresh()} disabled={stats.loading}>
            {stats.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {stats.error ? (
        <div class="banner banner-warn">
          <strong>Brain stats unavailable:</strong> {stats.error.message}
        </div>
      ) : stats.loading && !data ? (
        <div class="panel-empty">Loading brain stats…</div>
      ) : data ? (
        <>
          <div class={`brain-headline brain-headline-${state}`}>{brainHeadline(data)}</div>

          {state === 'reporting' && report ? (
            <div class="health-grid">
              <div class="health-cell">
                <span class="meta-k">Tokens saved</span>
                <span class="meta-v brain-metric">{formatTokens(report.tokensSaved)}</span>
              </div>
              <div class="health-cell">
                <span class="meta-k">Reuse (hit rate)</span>
                <span class="meta-v brain-metric">{formatHitRate(report.hitRate)}</span>
              </div>
              <div class="health-cell">
                <span class="meta-k">Hits / misses</span>
                <span class="meta-v">
                  {report.hits} hit{report.hits === 1 ? '' : 's'} / {report.misses} miss
                  {report.misses === 1 ? '' : 'es'}
                </span>
              </div>
              <div class="health-cell health-cell-wide">
                <span class="meta-k">Detail</span>
                <span class="meta-v">{report.detail}</span>
              </div>
            </div>
          ) : (
            <p class="panel-empty-sub brain-idle-note">
              {state === 'disabled'
                ? 'The shared brain is gated off, so there is no assemble-once reuse to report.'
                : 'The shared brain is enabled but has not been read yet, so there is no reuse to report. This is honest — distinct from a fabricated 0-tokens-saved success.'}
            </p>
          )}

          <div class="panel-subhead">
            <h3 class="panel-subtitle">Governance audit</h3>
            <span class={`badge tone-${governanceTone(data.governance)}`}>{governanceLabel(data.governance)}</span>
          </div>
          <div class="health-grid">
            <div class="health-cell">
              <span class="meta-k">Chain verified</span>
              <span class={`badge tone-${governanceTone(data.governance)}`}>
                {data.governance.ok ? 'ok' : 'unverified'}
              </span>
            </div>
            <div class="health-cell">
              <span class="meta-k">Audit entries</span>
              <span class="meta-v">{data.governance.entries}</span>
            </div>
            {data.governance.tipHash ? (
              <div class="health-cell health-cell-wide">
                <span class="meta-k">Merkle tip</span>
                <span class="meta-v brain-tiphash" title={data.governance.tipHash}>
                  {data.governance.tipHash}
                </span>
              </div>
            ) : (
              <div class="health-cell health-cell-wide">
                <span class="meta-k">Merkle tip</span>
                <span class="meta-v">none (audit chain unavailable)</span>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
