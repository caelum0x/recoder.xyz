/**
 * `OpsRecorderLoopbackAdapter` — the DEEP `EngineClientPort` over the vendored
 * ops-recorder work-signals detector (`backend/engines/py/ops-recorder/work-signals`,
 * FastAPI), supervised as an app-owned loopback subprocess through the ONE
 * `DaemonSupervisor`.
 *
 * DEEPENS (does not shallow-wrap) the proven seam in
 * `conductor/ops-recorder-daemon.ts` (uvicorn spawn/health/backoff + the
 * API-key preflight) + `conductor/ops-recorder-adapter.ts` (the `WorkSignalIngest`
 * wire shape). It REUSES the vendored `resolveOpsRecorderPython` /
 * `resolveOpsRecorderEntrypoint` resolvers and the `OpsRecorderIngestShape`
 * contract, and exercises the REAL detector + store surface:
 *
 *   - `ingest`        → `POST /work-signals/ingest`         (push one detected item)
 *   - `ingest.batch`  → `POST /work-signals/ingest/batch`   (push a batch)
 *   - `list`          → `GET  /work-signals`                (all detected signals)
 *   - `get`           → `GET  /work-signals/{id}`           (one signal)
 *   - `sync.github`   → `POST /work-signals/sync/github`    (run the GitHub detector)
 *   - `sync.linear`   → `POST /work-signals/sync/linear`    (run the Linear detector)
 *   - `handoff`       → `POST /work-signals/{id}/generate-handoff` (agent prompt)
 *   - `status`        → `PATCH /work-signals/{id}/status`   (resolve / re-open)
 *
 * DEGRADE-SAFE: the Python service 503s every non-health endpoint without
 * `OPS_RECORDER_API_KEY` (unless `OPS_RECORDER_AUTH_DISABLED`), so booting a
 * keyless shell would be useless — the adapter PREFLIGHTS that and reports
 * `down` (never spawns, never fakes). Every op sends the `X-API-Key` header the
 * service requires and returns a truthful `{ ok:false, reason }` on any failure.
 */
import {
  resolveOpsRecorderPython,
  resolveOpsRecorderEntrypoint,
} from '../../ops-recorder-daemon.js';
import {
  isOpsRecorderShape,
  type OpsRecorderIngestShape,
} from '../../ops-recorder-adapter.js';
import type { Logger } from '../../../../shared/logger.js';
import { fail, ok, type EngineId, type InvokeResult } from '../../types.js';
import type { EngineCall } from '../../ports/engine-client.port.js';
import type { DaemonSupervisorPort } from '../../ports/daemon-supervisor.port.js';
import {
  DaemonEngineAdapter,
  daemonFetch,
  type DaemonAdapterConfig,
  type ResolvedBinding,
} from './daemon-adapter-base.js';

const OPS_RECORDER_ID: EngineId = 'ops-recorder';

/** The header the FastAPI `require_api_key` dependency validates. */
const API_KEY_HEADER = 'X-API-Key';

/**
 * A conjunctive (AND) filter set for the `signals.query` / `signals.stats` ops.
 * Maps 1:1 onto the Python service's `/work-signals/query` query params (the
 * adapter snake_cases `itemType` → `item_type` on the wire).
 */
export interface OpsRecorderSignalFilters {
  /** Filter by source (`github` | `linear`). */
  readonly source?: string;
  /** Filter by item type (`pull_request` | `issue`). */
  readonly itemType?: string;
  /** Filter by priority (`high` | `medium` | `low`). */
  readonly priority?: string;
  /** Filter by resolution state. */
  readonly resolved?: boolean;
  /** Only signals detected at or after this ISO-8601 time. */
  readonly since?: string;
  /** Only signals detected at or before this ISO-8601 time. */
  readonly until?: string;
  /** Cap the number of results (`query` only; ignored by `stats`). */
  readonly limit?: number;
}

/** A work-signals op payload — a signal id, an ingest body, a batch, or filters. */
export interface OpsRecorderRequest {
  /** For `get` / `handoff` / `status`: the signal id. */
  readonly signalId?: string;
  /** For `ingest`: a single `WorkSignalIngest` shape. */
  readonly signal?: OpsRecorderIngestShape;
  /** For `ingest.batch`: many `WorkSignalIngest` shapes. */
  readonly signals?: readonly OpsRecorderIngestShape[];
  /** For `status`: mark resolved (true) or re-open (false). */
  readonly resolved?: boolean;
  /** For `signals.query` / `signals.stats`: the filter set. */
  readonly filters?: OpsRecorderSignalFilters;
}

const FORWARD_TIMEOUT_MS = 10_000;
const DETECTOR_TIMEOUT_MS = 15_000;

export class OpsRecorderLoopbackAdapter extends DaemonEngineAdapter<OpsRecorderRequest, unknown> {
  constructor(supervisor: DaemonSupervisorPort, config: DaemonAdapterConfig, log: Logger) {
    super(OPS_RECORDER_ID, supervisor, config, log);
  }

  /** The API key from the composer-injected minimal env (never `process.env`). */
  private apiKey(): string | undefined {
    return this.config.childEnv?.OPS_RECORDER_API_KEY?.trim() || undefined;
  }

  /** Whether auth is disabled (loopback-only dev) via the injected minimal env. */
  private authDisabled(): boolean {
    return /^(1|true|yes)$/i.test(this.config.childEnv?.OPS_RECORDER_AUTH_DISABLED?.trim() ?? '');
  }

  protected resolveBinding(): ResolvedBinding {
    // Auth preflight: a keyless, non-auth-disabled shell 503s every endpoint —
    // truthful degrade BEFORE spawning (never a useless shell).
    if (!this.apiKey() && !this.authDisabled()) {
      return { binPath: null, args: [] };
    }
    const python = this.config.binOverride ?? resolveOpsRecorderPython() ?? null;
    const entrypoint = resolveOpsRecorderEntrypoint() ?? null;
    if (!python || !entrypoint) return { binPath: null, args: [] };
    const [host, portStr] = this.listenAddr().split(':');
    return {
      binPath: python,
      // `-m uvicorn main:app` (not `main.py`, whose dev runner forces reload=True).
      args: ['-m', 'uvicorn', 'main:app', '--host', host || '127.0.0.1', '--port', portStr || '8894'],
      cwd: dirOf(entrypoint),
      env: { ...(this.config.childEnv ?? {}) },
    };
  }

  // NOTE: external-URL mode (`OPS_RECORDER_URL`) needs no API-key preflight — the
  // base `buildSpec` sets `externalUrl` and the supervisor skip-spawns + probes
  // it regardless of the (null) local binPath the preflight yields.

  async invoke(call: EngineCall<OpsRecorderRequest>): Promise<InvokeResult<unknown>> {
    const bound = await this.resolveBaseUrl();
    if (!bound.ok) return bound;
    const base = bound.value;
    const input = (call.input ?? {}) as OpsRecorderRequest;
    const timeoutMs = call.timeoutMs;
    switch (call.op) {
      case 'ingest':
        return this.ingest(base, input.signal, timeoutMs);
      case 'ingest.batch':
        return this.ingestBatch(base, input.signals, timeoutMs);
      case 'list':
      case 'query':
        return this.list(base, timeoutMs);
      case 'signals.query':
        return this.querySignals(base, input.filters, timeoutMs);
      case 'signals.stats':
        return this.signalStats(base, input.filters, timeoutMs);
      case 'get':
        return this.get(base, input.signalId, timeoutMs);
      case 'sync.github':
        return this.sync(base, 'github', timeoutMs);
      case 'sync.linear':
        return this.sync(base, 'linear', timeoutMs);
      case 'handoff':
        return this.handoff(base, input.signalId, timeoutMs);
      case 'status':
        return this.status(base, input.signalId, input.resolved, timeoutMs);
      default:
        return fail(
          `ops-recorder: unknown op '${call.op}' ` +
            `(expected ingest|ingest.batch|list|signals.query|signals.stats|get|sync.github|sync.linear|handoff|status)`,
          'unknown_op',
        );
    }
  }

  private headers(): Record<string, string> {
    const key = this.apiKey();
    return key ? { [API_KEY_HEADER]: key } : {};
  }

  private ingest(
    base: string,
    signal: OpsRecorderIngestShape | undefined,
    timeoutMs?: number,
  ): Promise<InvokeResult<unknown>> {
    if (!isOpsRecorderShape(signal)) {
      return Promise.resolve(
        fail('ops-recorder.ingest requires a WorkSignalIngest body (source/item_type/title/source_url/detected_reason/priority)', 'bad_input'),
      );
    }
    return daemonFetch(`${base}/work-signals/ingest`, {
      method: 'POST',
      headers: this.headers(),
      body: signal,
      timeoutMs: timeoutMs ?? FORWARD_TIMEOUT_MS,
    });
  }

  private ingestBatch(
    base: string,
    signals: readonly OpsRecorderIngestShape[] | undefined,
    timeoutMs?: number,
  ): Promise<InvokeResult<unknown>> {
    if (!Array.isArray(signals) || signals.length === 0) {
      return Promise.resolve(fail('ops-recorder.ingest.batch requires a non-empty `signals` array', 'bad_input'));
    }
    if (!signals.every(isOpsRecorderShape)) {
      return Promise.resolve(fail('ops-recorder.ingest.batch: every item must be a WorkSignalIngest shape', 'bad_input'));
    }
    return daemonFetch(`${base}/work-signals/ingest/batch`, {
      method: 'POST',
      headers: this.headers(),
      body: signals,
      timeoutMs: timeoutMs ?? FORWARD_TIMEOUT_MS,
    });
  }

  private list(base: string, timeoutMs?: number): Promise<InvokeResult<unknown>> {
    return daemonFetch(`${base}/work-signals`, {
      headers: this.headers(),
      timeoutMs: timeoutMs ?? FORWARD_TIMEOUT_MS,
    });
  }

  /**
   * Serialise the filter set into the `/work-signals/query` query string,
   * snake-casing `itemType` → `item_type` to match the Python route. Unset
   * fields are omitted; the leading `?` is included only when non-empty. Empty
   * / whitespace-only strings and non-finite `limit` are dropped so the wire
   * carries only meaningful filters.
   */
  private buildSignalQuery(filters?: OpsRecorderSignalFilters): string {
    if (!filters) return '';
    const params = new URLSearchParams();
    const put = (key: string, value?: string) => {
      const trimmed = value?.trim();
      if (trimmed) params.set(key, trimmed);
    };
    put('source', filters.source);
    put('item_type', filters.itemType);
    put('priority', filters.priority);
    put('since', filters.since);
    put('until', filters.until);
    if (typeof filters.resolved === 'boolean') params.set('resolved', String(filters.resolved));
    if (typeof filters.limit === 'number' && Number.isFinite(filters.limit)) {
      params.set('limit', String(Math.trunc(filters.limit)));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  /** Filtered, sorted view over recorded signals (`GET /work-signals/query`). */
  private querySignals(
    base: string,
    filters: OpsRecorderSignalFilters | undefined,
    timeoutMs?: number,
  ): Promise<InvokeResult<unknown>> {
    return daemonFetch(`${base}/work-signals/query${this.buildSignalQuery(filters)}`, {
      headers: this.headers(),
      timeoutMs: timeoutMs ?? FORWARD_TIMEOUT_MS,
    });
  }

  /** Aggregation roll-up over the (optionally filtered) signal set (`GET /work-signals/stats`). */
  private signalStats(
    base: string,
    filters: OpsRecorderSignalFilters | undefined,
    timeoutMs?: number,
  ): Promise<InvokeResult<unknown>> {
    // `stats` ignores `limit`; drop it so it never leaks onto the wire.
    const scoped = filters ? { ...filters, limit: undefined } : undefined;
    return daemonFetch(`${base}/work-signals/stats${this.buildSignalQuery(scoped)}`, {
      headers: this.headers(),
      timeoutMs: timeoutMs ?? FORWARD_TIMEOUT_MS,
    });
  }

  private get(base: string, signalId: string | undefined, timeoutMs?: number): Promise<InvokeResult<unknown>> {
    const id = signalId?.trim();
    if (!id) return Promise.resolve(fail('ops-recorder.get requires a `signalId`', 'bad_input'));
    return daemonFetch(`${base}/work-signals/${encodeURIComponent(id)}`, {
      headers: this.headers(),
      timeoutMs: timeoutMs ?? FORWARD_TIMEOUT_MS,
    });
  }

  /** Trigger a background detector run (GitHub/Linear polling → stuck-work signals). */
  private sync(base: string, source: 'github' | 'linear', timeoutMs?: number): Promise<InvokeResult<unknown>> {
    return daemonFetch(`${base}/work-signals/sync/${source}`, {
      method: 'POST',
      headers: this.headers(),
      timeoutMs: timeoutMs ?? DETECTOR_TIMEOUT_MS,
    });
  }

  private handoff(base: string, signalId: string | undefined, timeoutMs?: number): Promise<InvokeResult<unknown>> {
    const id = signalId?.trim();
    if (!id) return Promise.resolve(fail('ops-recorder.handoff requires a `signalId`', 'bad_input'));
    return daemonFetch(`${base}/work-signals/${encodeURIComponent(id)}/generate-handoff`, {
      method: 'POST',
      headers: this.headers(),
      timeoutMs: timeoutMs ?? DETECTOR_TIMEOUT_MS,
    });
  }

  private status(
    base: string,
    signalId: string | undefined,
    resolved: boolean | undefined,
    timeoutMs?: number,
  ): Promise<InvokeResult<unknown>> {
    const id = signalId?.trim();
    if (!id) return Promise.resolve(fail('ops-recorder.status requires a `signalId`', 'bad_input'));
    if (typeof resolved !== 'boolean') {
      return Promise.resolve(fail('ops-recorder.status requires a boolean `resolved`', 'bad_input'));
    }
    return daemonFetch(`${base}/work-signals/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: this.headers(),
      body: { resolved },
      timeoutMs: timeoutMs ?? FORWARD_TIMEOUT_MS,
    }).then((res) => (res.ok ? ok(res.value) : res));
  }
}

/** Directory of a file path (no node:path import at the type layer). */
function dirOf(filePath: string): string {
  const i = filePath.lastIndexOf('/');
  return i > 0 ? filePath.slice(0, i) : filePath;
}
