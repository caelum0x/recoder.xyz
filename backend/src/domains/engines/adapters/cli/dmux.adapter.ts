/**
 * `DmuxAdapter` — the `EngineClientPort` over the vendored `dmux` operator console,
 * the OPTIONAL multiplexer grid over N parallel agents (docs/subsystems/substrate.md
 * §4.3: NEVER on the critical path — absent dmux, the conductor substrate is fully
 * functional via tmux alone). It REUSES `conductor/dmux-adapter.ts`
 * (`dmuxAvailability` / `launchDmuxConsole` / `dmuxVisibleSessions` /
 * `dmuxAttachCommand`), which already pins dmux to the SAME tmux binary the
 * conductor drives so the console shares one tmux server.
 *
 * `invoke` maps ops onto that reused surface: `availability`, `sessions`
 * (conductor `recoder-*` sessions visible to the console), `attach-command`
 * (the exact operator attach line), and `launch` (spawn a detached console).
 *
 * DEGRADE-SAFE LAW: dmux not installed / no vendored build ⇒ `health()` is a
 * truthful `down` and `invoke` degrades honestly — dmux being absent is an
 * expected, non-fault degrade (it is optional).
 */
import {
  dmuxAttachCommand,
  dmuxAvailability,
  dmuxVisibleSessions,
  launchDmuxConsole,
  resolveDmuxBin,
  type DmuxAvailability,
} from '../../dmux-adapter.js';
import type { Logger } from '../../../../shared/logger.js';
import type { EnginesConfig } from '../../config.js';
import { isEngineEnabled } from '../../config.js';
import { EngineClientBase } from '../../ports/engine-client.port.js';
import type { EngineCall } from '../../ports/engine-client.port.js';
import { down, fail, ok, up, type EngineHealth, type InvokeResult } from '../../types.js';

/** The operator-console ops the adapter maps onto the reused dmux surface. */
export type DmuxOp = 'availability' | 'sessions' | 'attach-command' | 'launch';

export interface DmuxAdapterDeps {
  readonly config: EnginesConfig;
  readonly log: Logger;
  /** Override the availability probe (defaults to the conductor `dmuxAvailability`). */
  readonly availability?: () => Promise<DmuxAvailability>;
}

export class DmuxAdapter extends EngineClientBase<unknown, unknown> {
  private readonly deps: DmuxAdapterDeps;
  private readonly probe: () => Promise<DmuxAvailability>;

  constructor(deps: DmuxAdapterDeps) {
    super('dmux', 'cli');
    this.deps = deps;
    this.probe = deps.availability ?? dmuxAvailability;
  }

  async invoke(call: EngineCall<unknown>): Promise<InvokeResult<unknown>> {
    if (!isEngineEnabled(this.deps.config, 'dmux')) {
      return fail('dmux engine disabled by config', 'disabled');
    }
    const op = call.op as DmuxOp;
    const input = (call.input ?? {}) as Record<string, unknown>;
    try {
      switch (op) {
        case 'availability':
          return ok(await this.probe());
        case 'sessions':
          return ok({ sessions: await dmuxVisibleSessions() });
        case 'attach-command': {
          const repoPath = str(input.repoPath);
          if (!repoPath) return fail('dmux attach-command requires a repoPath', 'bad_input');
          return ok({ command: dmuxAttachCommand(repoPath), bin: resolveDmuxBin() });
        }
        case 'launch': {
          const repoPath = str(input.repoPath);
          if (!repoPath) return fail('dmux launch requires a repoPath', 'bad_input');
          const availability = await this.probe();
          if (!availability.available) {
            return fail(availability.reason ?? 'dmux is not available', 'unavailable');
          }
          const extraArgs = Array.isArray(input.extraArgs)
            ? input.extraArgs.filter((a): a is string => typeof a === 'string')
            : undefined;
          const launched = launchDmuxConsole({ repoPath, ...(extraArgs ? { extraArgs } : {}) });
          return ok(launched);
        }
        default:
          return fail(`unknown dmux op '${call.op}'`, 'bad_op');
      }
    } catch (err) {
      return fail(`dmux ${op} failed: ${message(err)}`);
    }
  }

  async health(): Promise<EngineHealth> {
    if (!isEngineEnabled(this.deps.config, 'dmux')) {
      return down('dmux', 'cli', 'dmux engine disabled by config');
    }
    const availability = await this.probe().catch((err) => {
      this.deps.log.warn({ err: message(err) }, 'dmux availability probe failed');
      return null;
    });
    if (availability?.available) {
      return up('dmux', 'cli', { bindingPath: availability.bin, version: availability.vendored ? 'vendored' : 'system' });
    }
    return down('dmux', 'cli', availability?.reason ?? 'dmux not installed and no vendored build (optional engine)');
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
