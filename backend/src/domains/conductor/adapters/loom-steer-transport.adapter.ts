/** Loom-backed live steering for workspaces hosted by the default Loom substrate. */
import type { LoggerPort } from '@recoder/substrate';
import type { LoomResult } from '@recoder/agent-runtimes/loom';
import type {
  SteerKeysInput,
  SteerTransportPort,
} from '../ports/steer-transport.port.js';

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

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
}

/**
 * Deliver submitted text through Loom's agent-aware prompt verb. Partial input
 * deliberately uses raw pane text so `submit:false` never appends Enter.
 */
export function createLoomSteerTransport(
  deps: CreateLoomSteerTransportDeps
): SteerTransportPort {
  const logger = deps.logger ?? NOOP_LOGGER;
  return {
    async sendKeys(input: SteerKeysInput): Promise<void> {
      if (input.substrate !== 'loom') {
        throw new Error(
          `loom steer transport cannot deliver to substrate ${input.substrate}`
        );
      }

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
    },
  };
}
