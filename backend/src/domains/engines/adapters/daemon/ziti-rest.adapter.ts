/**
 * `ZitiRestAdapter` — the DEEP `EngineClientPort` over OpenZiti's Edge Management
 * REST API (zero-trust identity + enrollment control plane). Unlike the spawned
 * loopback daemons, Ziti is an EXTERNALLY-managed controller reached over its
 * authenticated REST API — there is no local binary to supervise — so this
 * adapter binds `transport:'daemon'` but owns its own auth-based health probe
 * instead of a plain `/health` HTTP check, and never spawns a child.
 *
 * DEEPENS (does not shallow-wrap) `engines/ziti-client.ts`: it REUSES the
 * vendored controller-session auth + Edge Management calls (`zitiHealth`,
 * `listIdentities`, `createIdentity`, `provisionRunnerIdentity`,
 * `deleteIdentity`) and lifts them into the frozen `EngineClientPort` seam. The
 * real surface exercised:
 *
 *   - `health`             → authenticate against the controller (truthful up/down)
 *   - `identities.list`    → `GET    /edge/management/v1/identities`
 *   - `identity.create`    → `POST   /edge/management/v1/identities` (+ OTT JWT)
 *   - `identity.provision` → create a `recoder-runner`-tagged runner identity
 *   - `identity.delete`    → `DELETE /edge/management/v1/identities/{id}`
 *
 * DEGRADE-SAFE: an unconfigured / unreachable controller returns a truthful
 * `down` (health) and `{ ok:false, reason }` (invoke) — enrollment is NEVER
 * faked. The vendored client owns the env-based controller config + session
 * cache; this domain file reads NO `process.env`.
 */
import {
  zitiHealth,
  listIdentities,
  createIdentity,
  provisionRunnerIdentity,
  deleteIdentity,
} from '../../../../engines/ziti-client.js';
import type { Logger } from '../../../../shared/logger.js';
import { EngineClientBase, type EngineCall } from '../../ports/engine-client.port.js';
import {
  down,
  fail,
  ok,
  up,
  type EngineHealth,
  type EngineId,
  type InvokeResult,
} from '../../types.js';
import { message, type DaemonAdapterConfig } from './daemon-adapter-base.js';

const ZITI_ID: EngineId = 'ziti';

/** A ziti identity op payload — a filter, a create spec, or an id. */
export interface ZitiRequest {
  /** For `identities.list`: an optional Ziti filter expression. */
  readonly filter?: string;
  /** For `identity.create` / `identity.provision`: the identity name. */
  readonly name?: string;
  /** For `identity.create`: grant admin (default false). */
  readonly isAdmin?: boolean;
  /** For `identity.create`: role attributes to tag the identity with. */
  readonly roleAttributes?: readonly string[];
  /** For `identity.delete`: the identity id to remove. */
  readonly id?: string;
}

export class ZitiRestAdapter extends EngineClientBase<ZitiRequest, unknown> {
  constructor(
    private readonly config: DaemonAdapterConfig,
    private readonly log: Logger,
  ) {
    super(ZITI_ID, 'daemon');
  }

  // start/stop are no-ops: the controller is externally managed (nothing to
  // spawn or release). The base class defaults already satisfy this.

  async health(): Promise<EngineHealth> {
    if (!this.config.enabled) return down(ZITI_ID, 'daemon', 'disabled');
    const started = Date.now();
    try {
      const h = await zitiHealth();
      const probeMs = Date.now() - started;
      if (h.available) {
        return up(ZITI_ID, 'daemon', {
          probeMs,
          ...(h.controllerUrl ? { bindingPath: h.controllerUrl } : {}),
        });
      }
      const reason = h.configured
        ? h.reason ?? 'Ziti controller unreachable'
        : h.reason ?? 'Ziti controller not configured';
      return {
        ...down(ZITI_ID, 'daemon', reason, h.controllerUrl ? { bindingPath: h.controllerUrl } : {}),
        probeMs,
      };
    } catch (err) {
      return down(ZITI_ID, 'daemon', `ziti health error: ${message(err)}`);
    }
  }

  async invoke(call: EngineCall<ZitiRequest>): Promise<InvokeResult<unknown>> {
    if (!this.config.enabled) return fail('ziti is disabled', 'engine_disabled');
    const input = (call.input ?? {}) as ZitiRequest;
    try {
      switch (call.op) {
        case 'health': {
          const h = await zitiHealth();
          return h.available ? ok(h) : fail(h.reason ?? 'ziti unavailable', 'engine_down');
        }
        case 'identities.list': {
          const res = await listIdentities(input.filter);
          return res.available
            ? ok({ identities: res.identities })
            : fail(res.reason ?? 'ziti list failed', 'engine_down');
        }
        case 'identity.create': {
          const name = input.name?.trim();
          if (!name) return fail('ziti.identity.create requires a `name`', 'bad_input');
          const res = await createIdentity({
            name,
            ...(typeof input.isAdmin === 'boolean' ? { isAdmin: input.isAdmin } : {}),
            ...(input.roleAttributes ? { roleAttributes: [...input.roleAttributes] } : {}),
          });
          return res.available && res.identity
            ? ok({ identity: res.identity })
            : fail(res.reason ?? 'ziti identity create failed', 'engine_down');
        }
        case 'identity.provision': {
          const name = input.name?.trim();
          if (!name) return fail('ziti.identity.provision requires a `name`', 'bad_input');
          const res = await provisionRunnerIdentity(name);
          return res.available && res.identity
            ? ok({ identity: res.identity })
            : fail(res.reason ?? 'ziti runner provision failed', 'engine_down');
        }
        case 'identity.delete': {
          const id = input.id?.trim();
          if (!id) return fail('ziti.identity.delete requires an `id`', 'bad_input');
          const res = await deleteIdentity(id);
          return res.available && res.deleted
            ? ok({ deleted: true, id })
            : fail(res.reason ?? 'ziti identity delete failed', 'engine_down');
        }
        default:
          return fail(
            `ziti: unknown op '${call.op}' ` +
              `(expected health|identities.list|identity.create|identity.provision|identity.delete)`,
            'unknown_op',
          );
      }
    } catch (err) {
      // Vendored client is degrade-safe, but guard the seam anyway (never throws).
      return fail(`ziti call error: ${message(err)}`, 'request_failed');
    }
  }
}
