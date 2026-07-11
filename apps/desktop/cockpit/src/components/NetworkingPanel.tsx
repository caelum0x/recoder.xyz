/**
 * NetworkingPanel — Zero-Trust Networking (OpenZiti) surface.
 *
 * Surfaces:
 *   GET  /api/ziti/health       — mesh health + controller availability (public)
 *   GET  /api/ziti/identities   — list of provisioned zero-trust identities (auth)
 *
 * DEGRADE-SAFE: when the Ziti controller is absent or ZITI_CONTROLLER_URL is
 * not configured, the backend returns { available: false, reason: "..." } and
 * this panel renders a truthful "mesh unavailable — <reason>" state.
 * No mock data is ever shown. A network-unreachable backend shows a distinct
 * "Backend unreachable" banner so the user is never misled.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError, UnauthorizedError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import type { ZitiHealth, ZitiIdentity, ZitiIdentityList } from '../types';

const POLL_MS = 20_000;

// ── Error helpers ─────────────────────────────────────────────────────────────

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof UnauthorizedError) return `Unauthorized (${err.status}): ${err.message}`;
  if (err instanceof ApiError) return `Network error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

// ── Health strip ──────────────────────────────────────────────────────────────

interface MeshHealthProps {
  health: ZitiHealth;
}

function MeshHealthStrip({ health }: MeshHealthProps) {
  return (
    <div class="networking-health-strip">
      <span class={`networking-dot ${health.available ? 'tone-ok' : 'tone-muted'}`} />
      <span class="networking-health-label">
        {health.available ? 'Mesh available' : 'Mesh unavailable'}
      </span>
      {health.controllerUrl && (
        <span class="networking-controller-url">{health.controllerUrl}</span>
      )}
      {!health.available && health.reason && (
        <span class="networking-reason">{health.reason}</span>
      )}
    </div>
  );
}

// ── Identity row ──────────────────────────────────────────────────────────────

interface IdentityRowProps {
  identity: ZitiIdentity;
}

function IdentityRow({ identity }: IdentityRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div class="networking-identity-row">
      <div
        class="networking-identity-head"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((v) => !v); }}
      >
        <span class={`networking-dot ${identity.isAdmin ? 'tone-warn' : 'tone-ok'}`} />
        <span class="networking-identity-name">{identity.name}</span>
        <span class="networking-identity-id">{identity.id}</span>
        {identity.isAdmin && <span class="badge tone-warn">admin</span>}
        <span class="networking-expand-toggle">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && identity.enrollmentJwt && (
        <div class="networking-identity-jwt">
          <span class="networking-jwt-label">Enrollment JWT</span>
          <code class="networking-jwt-value">{identity.enrollmentJwt}</code>
        </div>
      )}
    </div>
  );
}

// ── Identities list ───────────────────────────────────────────────────────────

interface IdentitiesListProps {
  list: ZitiIdentityList;
}

function IdentitiesList({ list }: IdentitiesListProps) {
  if (!list.available) {
    return (
      <p class="networking-identities-unavailable">
        Identities unavailable — {list.reason ?? 'Ziti controller not reachable'}
      </p>
    );
  }

  if (list.identities.length === 0) {
    return <p class="panel-empty">No identities provisioned yet.</p>;
  }

  return (
    <div class="networking-identities-list">
      {list.identities.map((identity) => (
        <IdentityRow key={identity.id} identity={identity} />
      ))}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function NetworkingPanel() {
  const health = usePoll(() => api.zitiHealth(), POLL_MS);
  const identities = usePoll(() => api.zitiIdentities(), POLL_MS);

  const healthData: ZitiHealth | null = health.data;
  const identitiesData: ZitiIdentityList | null = identities.data;

  // True when the backend process itself cannot be reached.
  const unreachable =
    health.error instanceof BackendUnreachableError ||
    identities.error instanceof BackendUnreachableError;

  // True when the backend is reachable but the Ziti mesh is unconfigured/down.
  const meshUnavailable =
    !unreachable &&
    (healthData?.available === false ||
      (health.error instanceof ApiError && health.error.status === 503));

  // An unexpected non-503 error.
  const unexpectedError =
    !unreachable && !meshUnavailable ? (health.error ?? identities.error) : null;

  // Best-effort reason string from whichever data source is available.
  const unavailableReason =
    healthData?.reason ??
    (health.error instanceof ApiError ? health.error.message : null) ??
    'Set ZITI_CONTROLLER_URL and ZITI_API_TOKEN (or ZITI_ADMIN_USERNAME/PASSWORD) to enable the overlay network';

  const loading = health.loading || identities.loading;

  return (
    <section class="networking-panel">
      <div class="panel-head">
        <h2 class="panel-title">Networking / Zero-Trust Mesh</h2>
        <div class="panel-head-actions">
          <button
            class="btn btn-ghost btn-sm"
            onClick={() => {
              health.refresh();
              identities.refresh();
            }}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Backend unreachable banner */}
      {unreachable && (
        <div class="banner banner-error">
          <strong>Networking surface unavailable.</strong>{' '}
          Backend unreachable — cannot read mesh status.
        </div>
      )}

      {/* Mesh unavailable banner (backend up, controller absent/unconfigured) */}
      {!unreachable && meshUnavailable && (
        <div class="banner banner-warn">
          <strong>Zero-trust mesh unavailable.</strong> {unavailableReason}
          <p class="banner-hint">
            Deploy an OpenZiti controller and set <code>ZITI_CONTROLLER_URL</code> +{' '}
            <code>ZITI_API_TOKEN</code> (or admin credentials) to enable agent overlay
            networking. Runners and agents will use direct transport until the mesh is
            configured.
          </p>
        </div>
      )}

      {/* Unexpected non-503 error */}
      {unexpectedError && (
        <p class="action-error">Networking error: {describeError(unexpectedError)}</p>
      )}

      {/* Health strip when we have data */}
      {healthData && !unreachable && (
        <div class="networking-health-section">
          <div class="panel-section-head">
            <strong>Mesh health</strong>
          </div>
          <MeshHealthStrip health={healthData} />
        </div>
      )}

      {/* Identities section — only visible when mesh is available */}
      {!unreachable && !meshUnavailable && identitiesData && (
        <div class="networking-identities-section">
          <div class="panel-section-head">
            <strong>Identities</strong>
            {identitiesData.available && (
              <span class="networking-count">
                {identitiesData.identities.length}
              </span>
            )}
          </div>
          <IdentitiesList list={identitiesData} />
        </div>
      )}

      {/* Initial loading placeholder — only before any data arrives */}
      {loading && !healthData && !identitiesData && (
        <div class="panel-empty">Loading mesh status…</div>
      )}
    </section>
  );
}
