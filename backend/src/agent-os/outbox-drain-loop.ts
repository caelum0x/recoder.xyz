import { createLogger } from '../logger';
import { agentOsContainer } from './service-container';
import { drainAgentOsOutbox, type DrainAgentOsOutboxResult } from './outbox-drain.service';
import { createNatsOutboxPublisher } from './nats-outbox-publisher';

const logger = createLogger('agent-os-outbox-drain');

export type AgentOsOutboxDrainLoopConfig = {
  enabled: boolean;
  intervalMs: number;
  limit: number;
  runOnStart: boolean;
};

export type AgentOsOutboxDrainLoop = {
  enabled: boolean;
  config: AgentOsOutboxDrainLoopConfig;
  runOnce(): Promise<DrainAgentOsOutboxResult | null>;
  stop(): void;
};

export function readAgentOsOutboxDrainLoopConfig(
  env: NodeJS.ProcessEnv = process.env,
): AgentOsOutboxDrainLoopConfig {
  const enabled =
    env.AGENT_OS_OUTBOX_DRAIN_ENABLED === 'true' ||
    Boolean(env.AGENT_OS_OUTBOX_DRAIN_INTERVAL_MS);

  return {
    enabled,
    intervalMs: readPositiveInteger(env.AGENT_OS_OUTBOX_DRAIN_INTERVAL_MS, 60_000),
    limit: readPositiveInteger(env.AGENT_OS_OUTBOX_DRAIN_LIMIT, 100),
    runOnStart: env.AGENT_OS_OUTBOX_DRAIN_RUN_ON_START !== 'false',
  };
}

export function startAgentOsOutboxDrainLoop(
  config: AgentOsOutboxDrainLoopConfig = readAgentOsOutboxDrainLoopConfig(),
): AgentOsOutboxDrainLoop {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let stopped = false;

  const runOnce = async (): Promise<DrainAgentOsOutboxResult | null> => {
    if (!config.enabled || stopped || running) return null;

    running = true;
    let natsHandle: Awaited<ReturnType<typeof createNatsOutboxPublisher>> | null = null;
    try {
      natsHandle = await createNatsOutboxPublisher();
      const result = await drainAgentOsOutbox(agentOsContainer.repository, natsHandle.publisher, {
        limit: config.limit,
      });
      if (result.attempted > 0) {
        logger.info(
          {
            attempted: result.attempted,
            published: result.published,
            failed: result.failed,
            remainingPending: result.remainingPending,
          },
          'drained Agent OS CloudEvent outbox',
        );
      }
      return result;
    } catch (error) {
      logger.warn(
        { err: error },
        'Agent OS CloudEvent outbox drain failed',
      );
      return null;
    } finally {
      running = false;
      await natsHandle?.close().catch(() => undefined);
    }
  };

  if (config.enabled) {
    timer = setInterval(() => {
      void runOnce();
    }, config.intervalMs);
    timer.unref?.();

    if (config.runOnStart) {
      void runOnce();
    }
  }

  return {
    enabled: config.enabled,
    config,
    runOnce,
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

function readPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  return fallback;
}
