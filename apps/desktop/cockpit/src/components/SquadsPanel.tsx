/**
 * SquadsPanel — Multica managed-agents/squads surface.
 *
 * Surfaces:
 *   GET /api/multica/status  — truthful Multica seam health (503 when unconfigured)
 *   GET /api/multica/squads  — squad list from the Multica loopback (503 when absent)
 *
 * DEGRADE-SAFE: when the Multica server is absent or unconfigured, the backend
 * returns 503 and this panel shows a truthful "unavailable — <reason>" banner.
 * No mock data is ever rendered. Local squad.service.ts is the authoritative
 * fallback; Multica is an optional enrichment layer, not the source of truth.
 *
 * BOUNDARY: this panel is READ-ONLY. Recoder owns task/approval/memory state.
 * Multica is a replaceable execution surface — the panel surfaces squad status
 * without claiming ownership of any agent-OS state.
 */
import { api, ApiError, BackendUnreachableError, UnauthorizedError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import type { MulticaSquad, MulticaStatus, MulticaSquadsResult } from '../types';

const POLL_MS = 20_000;

// ── Error helpers ─────────────────────────────────────────────────────────────

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof UnauthorizedError) return `Unauthorized (${err.status}): ${err.message}`;
  if (err instanceof ApiError) return `Squads error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

// ── Mode badge ────────────────────────────────────────────────────────────────

interface ModeBadgeProps {
  mode: MulticaStatus['mode'];
  available: boolean;
}

function ModeBadge({ mode, available }: ModeBadgeProps) {
  const tone = available ? 'ok' : 'muted';
  return (
    <span class={`badge tone-${tone}`}>{mode}</span>
  );
}

// ── Status row ────────────────────────────────────────────────────────────────

interface StatusRowProps {
  label: string;
  value: string | number | boolean | null | undefined;
}

function StatusRow({ label, value }: StatusRowProps) {
  const display =
    value === null || value === undefined
      ? '—'
      : typeof value === 'boolean'
        ? value ? 'yes' : 'no'
        : String(value);
  return (
    <div class="squads-row">
      <span class="squads-label">{label}</span>
      <span class="squads-value">{display}</span>
    </div>
  );
}

// ── Squad card ────────────────────────────────────────────────────────────────

interface SquadCardProps {
  squad: MulticaSquad;
}

function SquadCard({ squad }: SquadCardProps) {
  return (
    <div class="squads-card">
      <div class="squads-card-head">
        <span class="squads-card-name">{squad.name}</span>
        <span class="squads-card-members">{squad.member_count} member{squad.member_count !== 1 ? 's' : ''}</span>
      </div>
      {squad.description && (
        <p class="squads-card-desc">{squad.description}</p>
      )}
      <div class="squads-card-meta">
        <StatusRow label="Squad ID" value={squad.id} />
        <StatusRow label="Leader ID" value={squad.leader_id} />
        <StatusRow label="Workspace" value={squad.workspace_id} />
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function SquadsPanel() {
  const statusPoll = usePoll(() => api.multicaStatus(), POLL_MS);
  const squadsPoll = usePoll(() => api.multicaSquads(), POLL_MS);

  const statusData: MulticaStatus | null = statusPoll.data;
  const squadsData: MulticaSquadsResult | null = squadsPoll.data;

  // Backend is completely unreachable (network error).
  const unreachable =
    statusPoll.error instanceof BackendUnreachableError ||
    squadsPoll.error instanceof BackendUnreachableError;

  // Backend replied but the Multica seam is 503/unavailable.
  const multicaUnavailable =
    !unreachable &&
    ((statusPoll.error instanceof ApiError && statusPoll.error.status === 503) ||
      (squadsPoll.error instanceof ApiError && squadsPoll.error.status === 503) ||
      statusData?.available === false);

  // A non-503 error (backend up, unexpected failure).
  const unexpectedError =
    !unreachable && !multicaUnavailable
      ? (statusPoll.error ?? squadsPoll.error)
      : null;

  // Best-effort unavailability reason.
  const unavailableReason =
    statusData?.reason ??
    (statusPoll.error instanceof ApiError ? statusPoll.error.message : null) ??
    (squadsPoll.error instanceof ApiError ? squadsPoll.error.message : null) ??
    'Multica server not configured. Set MULTICA_URL or build go/multica to enable managed-agents/squads.';

  const isAvailable = statusData?.available === true;
  const squads: MulticaSquad[] = squadsData?.squads ?? [];
  const loading = statusPoll.loading || squadsPoll.loading;

  function refresh() {
    statusPoll.refresh();
    squadsPoll.refresh();
  }

  return (
    <section class="squads-panel">
      <div class="panel-head">
        <h2 class="panel-title">Squads</h2>
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
          <strong>Squads surface unavailable.</strong>{' '}
          Backend unreachable — cannot read Multica squad status.
        </div>
      )}

      {!unreachable && multicaUnavailable && (
        <div class="banner banner-warn">
          <strong>Multica not running.</strong> {unavailableReason}
          <p class="banner-hint">
            Set <code>MULTICA_URL</code> to an external Multica server or build{' '}
            <code>go/multica</code> to enable managed-agents and squad routing.
            The local squad.service.ts handles squad state while Multica is absent.
          </p>
        </div>
      )}

      {unexpectedError && (
        <p class="action-error">Squads error: {describeError(unexpectedError)}</p>
      )}

      {statusData && (
        <div class="squads-status-block">
          <div class="squads-status-row">
            <ModeBadge mode={statusData.mode} available={isAvailable} />
            <span class={`squads-availability ${isAvailable ? 'tone-ok' : 'tone-muted'}`}>
              {isAvailable ? 'Available' : 'Unavailable'}
            </span>
          </div>
          <div class="squads-details">
            <StatusRow label="Service" value={statusData.service} />
            <StatusRow label="Mode" value={statusData.mode} />
            <StatusRow label="Base URL" value={statusData.baseUrl} />
            <StatusRow label="Listen addr" value={statusData.listenAddr} />
            <StatusRow label="Binary found" value={statusData.binaryFound} />
            {statusData.env.MULTICA_URL && (
              <StatusRow label="MULTICA_URL" value="set" />
            )}
            {!isAvailable && unavailableReason && (
              <StatusRow label="Reason" value={unavailableReason} />
            )}
          </div>
        </div>
      )}

      {isAvailable && squads.length > 0 && (
        <div class="squads-list">
          <div class="panel-section-head">
            <strong>Squads</strong>
            <span class="squads-count">{squads.length} squad{squads.length !== 1 ? 's' : ''}</span>
          </div>
          {squads.map((squad) => (
            <SquadCard key={squad.id} squad={squad} />
          ))}
        </div>
      )}

      {isAvailable && squads.length === 0 && !loading && (
        <div class="panel-empty">No squads found in this Multica workspace.</div>
      )}

      {!statusData && !loading && !unreachable && !multicaUnavailable && !unexpectedError && (
        <div class="panel-empty">No squad data available.</div>
      )}

      {loading && !statusData && (
        <div class="panel-empty">Loading squad status…</div>
      )}
    </section>
  );
}
