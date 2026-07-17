/**
 * `OpsRecorderClient` — the supervised loopback client for the EXISTING Python
 * `ops-recorder` work-signals sidecar (`backend/engines/py/ops-recorder/
 * work-signals`, used in place, zero rewrite). It fetches the signals the sidecar
 * detected over its HTTP surface and probes its availability. It NEVER detects or
 * fabricates a signal itself.
 *
 * TRUTHFULNESS (the manual check in §9 asserts this): when the sidecar is absent —
 * no `opsRecorderUrl`, unreachable, or the `require_api_key` preflight fails —
 * `availability()` is `down` and `fetchSignals()` returns `[]`. A silent hang must
 * never surface as "no problems"; the signals engine reports `down` and
 * `/health/full` shows it.
 *
 * The sidecar's REST shape (from `api/workSignalsRoutes.py`):
 *   GET  /work-signals            → RawWorkSignal[]
 *   GET  /work-signals/{id}       → RawWorkSignal
 * guarded by a `require_api_key` dependency that reads the `X-API-Key` header
 * (see `work-signals/config.py` — it accepts ONLY that header, never bearer).
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  RawWorkSignal,
  SignalsAvailability,
  WorkSignalsPort,
} from '../ports/signals.port.js';

export interface OpsRecorderClientDeps {
  readonly logger: Logger;
  /** Base URL of the in-box sidecar (e.g. `http://127.0.0.1:8091`); null ⇒ down. */
  readonly baseUrl: string | null;
  /**
   * Lazy LIVE URL source (the engines module's supervised daemon endpoint —
   * `null` until its first health passes). Consulted per call when no static
   * `baseUrl` is configured, so the supervised sidecar's published URL reaches
   * this client without a boot-ordering race. Absent + no `baseUrl` ⇒ down.
   */
  readonly urlProvider?: () => string | null;
  /** API key the sidecar's `require_api_key` expects in `X-API-Key`; null ⇒ preflight fails. */
  readonly token: string | null;
  /**
   * True when the sidecar runs with auth disabled (loopback-only dev): the
   * token preflight is skipped and the live probe decides truthfully.
   */
  readonly authDisabled?: boolean;
  /** Per-request timeout (ms). */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3_000;

export class OpsRecorderClient implements WorkSignalsPort {
  private readonly logger: Logger;
  private readonly staticBaseUrl: string | null;
  private readonly urlProvider: (() => string | null) | undefined;
  private readonly token: string | null;
  private readonly authDisabled: boolean;
  private readonly timeoutMs: number;

  constructor(deps: OpsRecorderClientDeps) {
    this.logger = deps.logger;
    this.staticBaseUrl = deps.baseUrl ? deps.baseUrl.replace(/\/+$/, '') : null;
    this.urlProvider = deps.urlProvider;
    this.token = deps.token;
    this.authDisabled = deps.authDisabled ?? false;
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** The effective base URL: static config first, then the LIVE provider. */
  private get baseUrl(): string | null {
    if (this.staticBaseUrl) return this.staticBaseUrl;
    const live = this.urlProvider?.() ?? null;
    return live ? live.replace(/\/+$/, '') : null;
  }

  async fetchSignals(): Promise<readonly RawWorkSignal[]> {
    if (!this.baseUrl) return [];
    const res = await this.request('/work-signals');
    if (!res) return [];
    try {
      const body = (await res.json()) as unknown;
      return Array.isArray(body) ? (body as RawWorkSignal[]) : [];
    } catch {
      // Malformed sidecar payload ⇒ no fabricated signals.
      return [];
    }
  }

  async fetchSignal(id: string): Promise<RawWorkSignal | null> {
    if (!this.baseUrl) return null;
    const res = await this.request(`/work-signals/${encodeURIComponent(id)}`);
    if (!res || res.status === 404) return null;
    try {
      return (await res.json()) as RawWorkSignal;
    } catch {
      return null;
    }
  }

  /**
   * Auth-preflighted availability probe. `down` (never `up`) when there is no URL,
   * the sidecar is unreachable, or the token is rejected — so the signals engine
   * is truthful. A `2xx`/`401`-distinguishing probe: a reachable-but-unauthorized
   * sidecar is `down` with an auth reason (we must not read its signals unsigned).
   */
  async availability(): Promise<SignalsAvailability> {
    if (!this.baseUrl) {
      return { status: 'down', reason: 'ops-recorder sidecar not configured (no URL)' };
    }
    if (!this.token && !this.authDisabled) {
      return { status: 'down', reason: 'ops-recorder auth token absent (preflight would fail)' };
    }
    try {
      const res = await this.request('/work-signals', 'GET');
      if (!res) return { status: 'down', reason: 'ops-recorder sidecar unreachable' };
      if (res.status === 401 || res.status === 403) {
        return { status: 'down', reason: 'ops-recorder auth preflight rejected' };
      }
      if (res.status >= 500) {
        return { status: 'degraded', reason: `ops-recorder returned ${res.status}` };
      }
      return { status: 'up' };
    } catch (err) {
      return {
        status: 'down',
        reason: `ops-recorder probe failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /** One authenticated GET with a bounded timeout; null on transport failure. */
  private async request(path: string, method = 'GET'): Promise<Response | null> {
    if (!this.baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.token ? { 'X-API-Key': this.token } : {},
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.debug(
        { err: err instanceof Error ? err.message : String(err), path },
        'ops-recorder request failed (signals degrade to down, no fabrication)',
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
