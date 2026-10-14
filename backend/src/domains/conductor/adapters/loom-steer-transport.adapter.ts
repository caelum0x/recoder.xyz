/**
 * Loom-backed live steering for workspaces hosted by the default Loom
 * substrate.
 *
 * This is the raw-PTY command surface the conductor's ACP tool-call gate does
 * NOT cover (ACP only gates an agent's own structured tool calls, not literal
 * text a human — or an agent — submits directly into a live terminal pane).
 * When a `commandGate` is injected, every SUBMITTED delivery (`input.submit
 * === true`, i.e. Enter was pressed — a real command, not a half-typed
 * keystroke) is decided by `CommandGatePort` BEFORE it ever reaches the Loom
 * socket. A `deny`/unapproved `needs_approval` throws, same as any other
 * delivery fault this transport already throws on — `steerWorkspace`'s
 * existing try/catch surfaces it as `ok:false` with the gate's reason, no new
 * failure shape. Partial (non-submit) keystrokes are NOT gated — there is no
 * discrete command yet, only in-progress typed characters.
 */
import type { LoggerPort } from '@recoder/substrate';
import type { LoomResult } from '@recoder/agent-runtimes/loom-client';
import type {
  SteerKeysInput,
  SteerTransportPort,
} from '../ports/steer-transport.port.js';
import type { CommandGatePort } from '../ports/command-gate.port.js';

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

/** The actor id attributed to raw-PTY steer commands in the audit log. Threading the real signed-in principal through `SteerKeysInput` is tracked as follow-up — see docs/T3CODE-FORK.md-adjacent command-gate wiring notes in plans/recoder.md. */
const DEFAULT_STEER_ACTOR_ID = 'recoder-interactive-steer';

export interface LoomSteerClientPort {
  /** The two Loom verbs this transport owns, not the engine's full API. */
  call<Result extends LoomResult = LoomResult>(
    method: LoomSteerMethod,
    params: unknown
  ): Promise<Result>;
}

export type LoomSteerMethod = 'agent.prompt' | 'pane.send_text';

export interface CreateLoomSteerTransportDeps {
  readonly client: LoomSteerClientPort;
  readonly logger?: LoggerPort;
  /**
   * The per-command content gate. Absent ⇒ ungated (same behavior as before
   * this wiring existed) — bootstrap always injects one in production; tests
   * that don't care about gating simply omit it.
   */
  readonly commandGate?: CommandGatePort;
  /** Actor id attributed to gated commands; defaults to a fixed interactive-steer id. */
  readonly actorId?: string;
}

/**
 * Deliver submitted text through Loom's agent-aware prompt verb. Partial input
 * deliberately uses raw pane text so `submit:false` never appends Enter.
 */
export function createLoomSteerTransport(
  deps: CreateLoomSteerTransportDeps
): SteerTransportPort {
  const logger = deps.logger ?? NOOP_LOGGER;
  const actorId = deps.actorId ?? DEFAULT_STEER_ACTOR_ID;

  async function deliver(input: SteerKeysInput): Promise<void> {
    if (input.submit) {
      const result = await deps.client.call('agent.prompt', {
        target: input.sessionName,
        text: input.keys,
      });
      if (result.type !== 'agent_prompted') {
        throw new Error(
          `loom agent.prompt returned '${result.type}', expected 'agent_prompted'`
        );
      }
    } else {
      const result = await deps.client.call('pane.send_text', {
        pane_id: input.sessionName,
        text: input.keys,
      });
      if (result.type !== 'ok') {
        throw new Error(
          `loom pane.send_text returned '${result.type}', expected 'ok'`
        );
      }
    }

    logger.info('loom steer delivered', {
      paneId: input.sessionName,
      bytes: input.keys.length,
      submit: input.submit,
    });
  }

  return {
    async sendKeys(input: SteerKeysInput): Promise<void> {
      if (input.substrate !== 'loom') {
        throw new Error(
          `loom steer transport cannot deliver to substrate ${input.substrate}`
        );
      }

      // Only a SUBMITTED command is a discrete, gateable action; partial
      // keystrokes have no command content yet to classify.
      if (!input.submit || !deps.commandGate) {
        await deliver(input);
        return;
      }

      const outcome = await deps.commandGate.gate({
        actorId,
        command: input.keys,
        metadata: { paneId: input.sessionName, substrate: input.substrate },
        deliver: () => deliver(input),
      });

      if (!outcome.allowed) {
        logger.warn('loom steer command denied by command gate', {
          paneId: input.sessionName,
          reason: outcome.reason,
          tier: outcome.tier,
        });
        throw new Error(`command denied: ${outcome.reason}`);
      }
    },
  };
}
