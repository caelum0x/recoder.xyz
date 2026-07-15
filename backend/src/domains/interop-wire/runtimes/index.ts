/**
 * Runtime connectors registry — the canonical set of coding-agent runtimes the
 * interop-wire domain advertises as A2A dispatch targets, plus a one-shot
 * registration helper the composer calls at boot.
 *
 * Registration is degrade-safe: it registers each runtime's advertised card
 * through the {@link AgentRegistryService}; a per-runtime fault is swallowed (that
 * runtime is simply absent from the registry) rather than failing the boot.
 */
import type { AgentRegistryService } from '../registry/agent-registry.js';
import type { AgentRow } from '../types.js';
import { toUpsertAgentInput, type RuntimeConnectorDescriptor } from './runtime-connector.js';
import { claudeRuntimeConnector } from './claude.adapter.js';
import { codexRuntimeConnector } from './codex.adapter.js';
import { opencodeRuntimeConnector } from './opencode.adapter.js';
import { cursorRuntimeConnector } from './cursor.adapter.js';
import { windsurfRuntimeConnector } from './windsurf.adapter.js';
import { replitRuntimeConnector } from './replit.adapter.js';

export type { RuntimeConnectorDescriptor } from './runtime-connector.js';
export { runtimeCard, toUpsertAgentInput, RUNTIME_BASE_CAPABILITIES } from './runtime-connector.js';

/** The six coding-agent runtime connectors advertised by this instance. */
export const RUNTIME_CONNECTORS: readonly RuntimeConnectorDescriptor[] = [
  claudeRuntimeConnector,
  codexRuntimeConnector,
  opencodeRuntimeConnector,
  cursorRuntimeConnector,
  windsurfRuntimeConnector,
  replitRuntimeConnector,
];

/**
 * Register every runtime connector as an owner-scoped `kind:'runtime'` agent.
 * Returns the rows that registered successfully (degrade-safe per runtime).
 */
export async function registerRuntimeConnectors(
  registry: AgentRegistryService,
  userId: string,
): Promise<readonly AgentRow[]> {
  const rows: AgentRow[] = [];
  for (const descriptor of RUNTIME_CONNECTORS) {
    try {
      const input = toUpsertAgentInput(descriptor, userId);
      rows.push(
        await registry.register({
          id: input.id,
          userId: input.userId,
          kind: 'runtime',
          runtimeId: input.runtimeId,
          card: input.card,
          status: input.status,
        }),
      );
    } catch {
      // A single runtime failing to register must not block the others.
    }
  }
  return rows;
}
