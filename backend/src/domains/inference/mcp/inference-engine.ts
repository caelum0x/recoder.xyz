/**
 * The inference domain's own MCP tools (the in-proc `inference` server):
 * `inference.models`, `inference.health`, `inference.complete`,
 * `inference.embed`, `inference.feedback`. Every call still passes the interop
 * `authorize→risk→policy→audit` gate at the host boundary, so these handlers
 * stay thin and truthful over the module surface.
 *
 * `inference.models` / `inference.health` are READ-ONLY (always safe).
 * `inference.complete` is a governed call: the host risk-gates model invocation
 * (spend), and the routing service records the usage-ledger + delivery-outcome
 * rows. `inference.feedback` attaches a signal to a prior inference_id (audited
 * as a delivery outcome). `inference.embed` routes an embedding call down the
 * same gateway seam. All results are truthful — an unroutable call returns
 * `{ routed:false }` with a reason, never a fabricated
 * completion/embedding/feedback_id.
 *
 * TENANT IDENTITY: the `userId` a call is attributed to (quota + spend) is the
 * HOST-AUTHORIZED, edge-bound caller (2nd handler param `caller.userId`), NEVER a
 * caller-supplied arg. An earlier `args.requestedBy` selector let any caller
 * attribute quota/spend to a victim (cross-tenant quota drain); it is dropped.
 */
import type { McpToolRegistration, McpToolCaller } from '../../../shared/module-base.js';
import type { InferenceGatewayPort } from '../ports/inference-gateway.port.js';
import type { ModelCatalogRepository } from '../ports/model-catalog.port.js';
import type { InferenceRoutingService } from '../services/inference-routing.service.js';
import { parseEmbeddingInput } from '../routes/openai-embeddings.routes.js';
import type { InferenceMessage, InferenceRole } from '../types.js';

/** The `inference` in-proc server id (matches the catalog descriptor). */
export const INFERENCE_MCP_SERVER_ID = 'inference';

export interface InferenceMcpDeps {
  readonly gateway: InferenceGatewayPort;
  readonly catalog: ModelCatalogRepository;
  readonly routing: Pick<InferenceRoutingService, 'complete' | 'embed' | 'feedback'>;
}

const VALID_ROLES: ReadonlySet<string> = new Set(['system', 'user', 'assistant', 'tool']);

interface CompleteInput {
  readonly model?: string;
  readonly messages?: unknown;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

interface EmbedInput {
  readonly model?: string;
  readonly input?: unknown;
}

interface FeedbackInput {
  readonly inferenceId?: string;
  readonly metricName?: string;
  readonly value?: unknown;
}

/**
 * The tenant `userId` an inference call is attributed to (quota + spend). It is
 * the HOST-AUTHORIZED, edge-bound caller (`caller.userId`) — NEVER a caller-supplied
 * arg (the old `args.requestedBy`, which let any caller drain/bill a victim's
 * quota). Absent an edge-bound caller (direct/internal path, no bound identity),
 * the call is unattributed and the routing gate degrades open — it is never
 * attributed to a spoofed subject.
 */
function subjectUserId(caller?: McpToolCaller): string | undefined {
  const userId = caller?.userId?.trim();
  return userId ? userId : undefined;
}

/**
 * Operator bypass for the cross-tenant feedback ownership guard: an `admin`- or
 * `internal`-scoped host-authorized caller (mirrors the route's
 * `isPrivilegedPrincipal`). Derived ONLY from the edge-bound caller's scopes,
 * NEVER from a tool arg. Absent scopes ⇒ not privileged (ownership is enforced).
 */
function isPrivilegedCaller(caller?: McpToolCaller): boolean {
  const scopes = caller?.scopes;
  return (scopes?.includes('admin') ?? false) || (scopes?.includes('internal') ?? false);
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
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as CompleteInput;
        const model = input.model?.trim();
        if (!model) return { error: 'model (string) is required' };
        const messages = parseMessages(input.messages);
        if (!messages) return { error: 'messages (non-empty array of {role,content}) is required' };
        const userId = subjectUserId(caller);
        const result = await deps.routing.complete({
          model,
          messages,
          ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
          ...(typeof input.maxTokens === 'number' ? { maxTokens: input.maxTokens } : {}),
          ...(userId ? { userId } : {}),
        });
        return { result };
      },
    },
    {
      name: 'inference.embed',
      description:
        'Route an embedding call (string or string[] input) through the delivery ladder. ' +
        'Returns a truthful { routed, tier, embeddings, usage } — never fabricated vectors.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as EmbedInput;
        const model = input.model?.trim();
        if (!model) return { error: 'model (string) is required' };
        const parsed = parseEmbeddingInput(input.input);
        if (parsed === null) {
          return { error: 'input (non-empty string or non-empty array of non-empty strings) is required' };
        }
        const userId = subjectUserId(caller);
        const result = await deps.routing.embed({
          model,
          input: parsed,
          ...(userId ? { userId } : {}),
        });
        return { result };
      },
    },
    {
      name: 'inference.feedback',
      description:
        'Attach a feedback signal (boolean/float metric or comment string) to a prior inference_id ' +
        '(merge/approve = positive). Audited as a delivery outcome. Returns a truthful { routed, feedbackId? } — ' +
        'never a fabricated feedback_id.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as FeedbackInput;
        const inferenceId = input.inferenceId?.trim();
        if (!inferenceId) return { error: 'inferenceId (string) is required' };
        const metricName = input.metricName?.trim();
        if (!metricName) return { error: 'metricName (string) is required' };
        const value = input.value;
        if (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string') {
          return { error: 'value (boolean | number | string) is required' };
        }
        const userId = subjectUserId(caller);
        // Cross-tenant ownership is enforced in the routing service; the bypass is
        // derived from the edge-bound caller's scopes (admin/internal), NEVER a tool
        // arg — an ordinary caller can only attach a signal to an inference IT
        // produced (result is a truthful { routed:false, denied:'not_found' } otherwise).
        const bypassOwnershipCheck = isPrivilegedCaller(caller);
        const result = await deps.routing.feedback({
          inferenceId,
          metricName,
          value,
          ...(userId ? { userId } : {}),
          ...(bypassOwnershipCheck ? { bypassOwnershipCheck: true } : {}),
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
  toolNames: [
    'inference.models',
    'inference.health',
    'inference.complete',
    'inference.embed',
    'inference.feedback',
  ] as readonly string[],
  metadata: { external: false },
};
