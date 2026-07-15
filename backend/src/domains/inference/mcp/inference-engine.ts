/**
 * The inference domain's own MCP tools (the in-proc `inference` server):
 * `inference.models`, `inference.health`, `inference.complete`. Every call still
 * passes the interop `authorize→risk→policy→audit` gate at the host boundary, so
 * these handlers stay thin and truthful over the module surface.
 *
 * `inference.models` / `inference.health` are READ-ONLY (always safe).
 * `inference.complete` is a governed call: the host risk-gates model invocation
 * (spend), and the routing service records the usage-ledger + delivery-outcome
 * rows. All results are truthful — an unroutable call returns `{ routed:false }`
 * with a reason, never a fabricated completion.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { InferenceGatewayPort } from '../ports/inference-gateway.port.js';
import type { ModelCatalogRepository } from '../ports/model-catalog.port.js';
import type { InferenceRoutingService } from '../services/inference-routing.service.js';
import type { InferenceMessage, InferenceRole } from '../types.js';

/** The `inference` in-proc server id (matches the catalog descriptor). */
export const INFERENCE_MCP_SERVER_ID = 'inference';

export interface InferenceMcpDeps {
  readonly gateway: InferenceGatewayPort;
  readonly catalog: ModelCatalogRepository;
  readonly routing: Pick<InferenceRoutingService, 'complete'>;
}

const VALID_ROLES: ReadonlySet<string> = new Set(['system', 'user', 'assistant', 'tool']);

interface CompleteInput {
  readonly model?: string;
  readonly messages?: unknown;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly requestedBy?: string;
}

/** Parse + validate an MCP messages array (system boundary — never trust input). */
function parseMessages(value: unknown): InferenceMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: InferenceMessage[] = [];
  for (const m of value) {
    if (!m || typeof m !== 'object') return null;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (typeof role !== 'string' || !VALID_ROLES.has(role) || typeof content !== 'string') return null;
    out.push({ role: role as InferenceRole, content });
  }
  return out;
}

/** Build the inference-domain MCP tool registrations over the injected deps. */
export function buildInferenceMcpTools(deps: InferenceMcpDeps): readonly McpToolRegistration[] {
  return [
    {
      name: 'inference.models',
      description: 'List the routable model catalog: id, provider, context window, pricing, streaming support.',
      handler: async () => {
        const models = await deps.catalog.list({ enabledOnly: true });
        return { count: models.length, models };
      },
    },
    {
      name: 'inference.health',
      description: 'Truthful inference gateway health: which delivery tier is bound + reachable (napi/loopback/none).',
      handler: async () => ({ health: await deps.gateway.health() }),
    },
    {
      name: 'inference.complete',
      description:
        'Route a buffered chat completion through the delivery ladder (governed; usage + cost are ledgered). ' +
        'Returns a truthful { routed, tier, content, usage } — never a fabricated completion.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as CompleteInput;
        const model = input.model?.trim();
        if (!model) return { error: 'model (string) is required' };
        const messages = parseMessages(input.messages);
        if (!messages) return { error: 'messages (non-empty array of {role,content}) is required' };
        const result = await deps.routing.complete({
          model,
          messages,
          ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
          ...(typeof input.maxTokens === 'number' ? { maxTokens: input.maxTokens } : {}),
          ...(input.requestedBy?.trim() ? { userId: input.requestedBy.trim() } : {}),
        });
        return { result };
      },
    },
  ];
}

/**
 * The `inference` server descriptor for the gated registry catalog. The composer
 * adds this to the host registry + registers the handlers above so the wiring
 * guard passes. Tool names must match `buildInferenceMcpTools`.
 */
export const inferenceMcpServer = {
  serverId: INFERENCE_MCP_SERVER_ID,
  kind: 'inference',
  displayName: 'Inference (BYOK LLM gateway)',
  transport: 'in-proc' as const,
  enabled: true,
  toolNames: ['inference.models', 'inference.health', 'inference.complete'] as readonly string[],
  metadata: { external: false },
};
