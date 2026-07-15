/**
 * `MulticaLoopbackAdapter` — the DEEP `EngineClientPort` over the vendored
 * Multica managed-agents / squads platform (`apps/desktop/server/engines/multica`,
 * a Go server), supervised as an app-owned loopback binary through the ONE
 * `DaemonSupervisor`.
 *
 * DEEPENS (does not shallow-wrap) `engines/multica-client.ts` (spawn/health +
 * the squad/assign wire contract). It REUSES the vendored `resolveMulticaBin`
 * resolver and `MulticaSquad` shape, and exercises the REAL squad leader-routing
 * surface Multica exposes:
 *
 *   - `squads.list`  → `GET  /api/squads`        (squads + their leader_id + members)
 *   - `squad.get`    → `GET  /api/squads/{id}`   (one squad's leader-routing config)
 *   - `assign`       → `POST /api/issues`        (route a task to an agent/squad leader)
 *
 * Multica groups agents under a squad leader for stable work routing; assigning
 * to a squad routes through its leader. This adapter is an OPTIONAL enrichment
 * layer — the local `squad.service.ts` stays authoritative, so a `down` Multica
 * degrades truthfully (`{ ok:false, reason }`), never faking a route.
 *
 * DEGRADE-SAFE: no Go build here — an absent binary (and no `MULTICA_URL`) →
 * `binPath:null` → supervisor degrades to `down`. The API key + workspace id are
 * taken ONLY from the composer-injected minimal env (never `process.env`).
 */
import { resolveMulticaBin, type MulticaSquad } from '../../../../engines/multica-client.js';
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

const MULTICA_ID: EngineId = 'multica';

/** A squad-routing op payload — a squad id and/or an assignment. */
export interface MulticaRequest {
  /** For `squad.get`: the squad id. */
  readonly squadId?: string;
  /** For `assign`: the human-readable task title. */
  readonly title?: string;
  /** For `assign`: the target agent or squad id. */
  readonly assigneeId?: string;
  /** For `assign`: whether the assignee is an individual agent or a squad leader. */
  readonly assigneeType?: 'agent' | 'squad';
}

const CALL_TIMEOUT_MS = 10_000;

export class MulticaLoopbackAdapter extends DaemonEngineAdapter<MulticaRequest, unknown> {
  constructor(supervisor: DaemonSupervisorPort, config: DaemonAdapterConfig, log: Logger) {
    super(MULTICA_ID, supervisor, config, log);
  }

  protected resolveBinding(): ResolvedBinding {
    const bin = this.config.binOverride ?? resolveMulticaBin() ?? null;
    if (!bin) return { binPath: null, args: [] };
    const portStr = this.listenAddr().split(':')[1] ?? '8895';
    // MINIMAL env: the Go server reads PORT; the API key is forwarded only when set.
    const env: Record<string, string> = { PORT: portStr };
    const apiKey = this.config.childEnv?.MULTICA_API_KEY?.trim();
    if (apiKey) env['MULTICA_API_KEY'] = apiKey;
    return { binPath: bin, args: [], env };
  }

  async invoke(call: EngineCall<MulticaRequest>): Promise<InvokeResult<unknown>> {
    const bound = await this.resolveBaseUrl();
    if (!bound.ok) return bound;
    const base = bound.value;
    const input = (call.input ?? {}) as MulticaRequest;
    switch (call.op) {
      case 'squads.list':
        return this.listSquads(base, call.timeoutMs);
      case 'squad.get':
        return this.getSquad(base, input.squadId, call.timeoutMs);
      case 'assign':
        return this.assign(base, input, call.timeoutMs);
      default:
        return fail(
          `multica: unknown op '${call.op}' (expected squads.list|squad.get|assign)`,
          'unknown_op',
        );
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    const apiKey = this.config.childEnv?.MULTICA_API_KEY?.trim();
    const workspaceId = this.config.childEnv?.MULTICA_WORKSPACE_ID?.trim();
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    if (workspaceId) headers['X-Workspace-ID'] = workspaceId;
    return headers;
  }

  private async listSquads(base: string, timeoutMs?: number): Promise<InvokeResult<{ squads: MulticaSquad[] }>> {
    const res = await daemonFetch<unknown>(`${base}/api/squads`, {
      headers: this.headers(),
      timeoutMs: timeoutMs ?? CALL_TIMEOUT_MS,
    });
    if (!res.ok) return res;
    const squads = Array.isArray(res.value) ? (res.value as MulticaSquad[]) : [];
    return ok({ squads });
  }

  private getSquad(base: string, squadId: string | undefined, timeoutMs?: number): Promise<InvokeResult<unknown>> {
    const id = squadId?.trim();
    if (!id) return Promise.resolve(fail('multica.squad.get requires a `squadId`', 'bad_input'));
    return daemonFetch(`${base}/api/squads/${encodeURIComponent(id)}`, {
      headers: this.headers(),
      timeoutMs: timeoutMs ?? CALL_TIMEOUT_MS,
    });
  }

  /** `POST /api/issues` — route a task to an agent or (via its leader) a squad. */
  private async assign(base: string, input: MulticaRequest, timeoutMs?: number): Promise<InvokeResult<{ issueId?: string }>> {
    const title = input.title?.trim();
    const assigneeId = input.assigneeId?.trim();
    const assigneeType = input.assigneeType;
    if (!title) return fail('multica.assign requires a `title`', 'bad_input');
    if (!assigneeId) return fail('multica.assign requires an `assigneeId`', 'bad_input');
    if (assigneeType !== 'agent' && assigneeType !== 'squad') {
      return fail("multica.assign requires `assigneeType` of 'agent' | 'squad'", 'bad_input');
    }
    const res = await daemonFetch<Record<string, unknown>>(`${base}/api/issues`, {
      method: 'POST',
      headers: this.headers(),
      body: { title, assignee_id: assigneeId, assignee_type: assigneeType },
      timeoutMs: timeoutMs ?? CALL_TIMEOUT_MS,
    });
    if (!res.ok) return res;
    const issueId = typeof res.value?.['id'] === 'string' ? (res.value['id'] as string) : undefined;
    return ok(issueId ? { issueId } : {});
  }
}
