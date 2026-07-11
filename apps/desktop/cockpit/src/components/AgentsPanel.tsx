/**
 * AgentsPanel — OpenFang autonomous agent engine surface.
 *
 * Surfaces:
 *   GET /api/agents/openfang/health — truthful daemon health (503 when binary absent)
 *   GET /api/agents/openfang       — agent card + current runtime status
 *
 * A2A BOUNDARY: this panel is READ-ONLY. Recoder owns task/approval/memory state.
 * OpenFang is a replaceable execution surface — the panel surfaces its runtime
 * health without claiming ownership of any agent-OS state.
 *
 * DEGRADE-SAFE: when the openfang daemon is absent or the binary has not been
 * built, the backend returns 503 and this panel shows a truthful
 * "unavailable — <reason>" banner. No mock data is ever rendered.
 */
import { api, ApiError, BackendUnreachableError, UnauthorizedError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import type { OpenfangAgentCard, OpenfangHealth } from '../types';

const POLL_MS = 15_000;

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof UnauthorizedError) return `Unauthorized (${err.status}): ${err.message}`;
  if (err instanceof ApiError) return `Agent error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

// ── Status badge ──────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: 'up' | 'unavailable';
}

function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span class={`badge tone-${status === 'up' ? 'ok' : 'muted'}`}>
      {status === 'up' ? 'running' : 'unavailable'}
    </span>
  );
}

// ── Detail row ────────────────────────────────────────────────────────────────

interface DetailRowProps {
  label: string;
  value: string | number | null | undefined;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div class="agents-row">
      <span class="agents-label">{label}</span>
      <span class="agents-value">{value != null ? String(value) : '—'}</span>
    </div>
  );
}

// ── Agent card ────────────────────────────────────────────────────────────────

interface AgentCardProps {
  card: OpenfangAgentCard;
  health: OpenfangHealth | null;
}

function AgentCard({ card, health }: AgentCardProps) {
  const isUp = card.status === 'up';
  return (
    <div class={`agents-card${isUp ? ' agents-card--up' : ' agents-card--down'}`}>
      <div class="agents-card-head">
        <StatusBadge status={card.status} />
        <span class="agents-card-name">{card.name}</span>
      </div>
      <p class="agents-card-desc">{card.description}</p>
      <div class="agents-card-details">
        <DetailRow label="Agent ID" value={card.agentId} />
        <DetailRow label="A2A boundary" value={card.a2aBoundary ? 'yes' : 'no'} />
        <DetailRow
          label="Listen address"
          value={card.listenAddr ?? health?.listenAddr ?? null}
        />
        {health?.binPath && <DetailRow label="Binary" value={health.binPath} />}
        {health?.pid != null && <DetailRow label="PID" value={health.pid} />}
        {!isUp && health?.reason && (
          <DetailRow label="Reason" value={health.reason} />
        )}
      </div>
      {card.a2aBoundary && (
        <p class="agents-a2a-note">
          Read-only surface. Recoder owns task, approval, and memory state. OpenFang emits
          RunEvents only.
        </p>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function AgentsPanel() {
  const healthPoll = usePoll(() => api.openfangHealth(), POLL_MS);
  const cardPoll = usePoll(() => api.openfangAgent(), POLL_MS);

  const healthData: OpenfangHealth | null = healthPoll.data;
  const cardData: OpenfangAgentCard | null = cardPoll.data;

  // Backend is completely unreachable (network error).
  const unreachable =
    healthPoll.error instanceof BackendUnreachableError ||
    cardPoll.error instanceof BackendUnreachableError;

  // Backend replied but the daemon is absent (503 on health) or the card says unavailable.
  const daemonUnavailable =
    !unreachable &&
    ((healthPoll.error instanceof ApiError && healthPoll.error.status === 503) ||
      healthData?.status === 'unavailable' ||
      cardData?.status === 'unavailable');

  // A non-503 error (backend reachable, unexpected failure).
  const unexpectedError =
    !unreachable && !daemonUnavailable ? (healthPoll.error ?? cardPoll.error) : null;

  const unavailableReason =
    healthData?.reason ??
    (healthPoll.error instanceof ApiError ? healthPoll.error.message : null) ??
    'OpenFang binary not built. Build crates/openfang or set OPENFANG_BIN to enable the autonomous agent engine.';

  const loading = healthPoll.loading || cardPoll.loading;

  function refresh() {
    healthPoll.refresh();
    cardPoll.refresh();
  }

  return (
    <section class="agents-panel">
      <div class="panel-head">
        <h2 class="panel-title">Agents</h2>
        <div class="panel-head-actions">
          <button
            class="btn btn-ghost btn-sm"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {unreachable && (
        <div class="banner banner-error">
          <strong>Agent surface unavailable.</strong>{' '}
          Backend unreachable — cannot read openfang agent status.
        </div>
      )}

      {!unreachable && daemonUnavailable && (
        <div class="banner banner-warn">
          <strong>OpenFang daemon not running.</strong> {unavailableReason}
          <p class="banner-hint">
            Build <code>crates/openfang</code> or set <code>OPENFANG_BIN</code> to enable the
            autonomous agent engine. The run loop degrades to the pure-TS OSS dispatch path while the
            daemon is absent.
          </p>
        </div>
      )}

      {unexpectedError && (
        <p class="action-error">Agent error: {describeError(unexpectedError)}</p>
      )}

      {cardData && (
        <div class="agents-list">
          <AgentCard card={cardData} health={healthData} />
        </div>
      )}

      {!cardData && !loading && !unreachable && !daemonUnavailable && !unexpectedError && (
        <div class="panel-empty">No agent data available.</div>
      )}

      {loading && !cardData && (
        <div class="panel-empty">Loading agent status…</div>
      )}
    </section>
  );
}
