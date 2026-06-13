import type { AgentCard } from '@recoder/a2a-sdk/schemas';

export type AgentGatewayCardOptions = {
  baseUrl?: string;
  includeExtended?: boolean;
};

export function createAgentGatewayCard(options: AgentGatewayCardOptions = {}): AgentCard {
  const baseUrl = options.baseUrl ?? process.env['RECODER_AGENT_GATEWAY_URL'] ?? 'http://localhost:4317';

  return {
    id: 'recoder-agent-gateway',
    name: 'Recoder Agent Gateway',
    platform: 'recoder_backend',
    description: 'A2A-compatible gateway for Recoder Agent OS tasks, artifacts, streaming, and cancellation.',
    url: baseUrl,
    version: '0.1.0',
    capabilities: [
      'agent.discovery',
      'task.send',
      'task.stream',
      'task.get',
      'task.list',
      'task.cancel',
      'task.subscribe',
      'artifact.update',
      'push_notification.configure',
    ],
    skills: [
      {
        id: 'recoder.task.run',
        name: 'Run Recoder TaskSpec',
        description: 'Accepts Recoder TaskSpec and InstructionBundle references through A2A payloads.',
        tags: ['task', 'agent-os', 'instruction-bundle'],
      },
      {
        id: 'recoder.artifact.attach',
        name: 'Attach Artifact Evidence',
        description: 'Attaches summaries, logs, verification output, previews, and PR references to task history.',
        tags: ['artifact', 'evidence', 'audit'],
      },
    ],
    securitySchemes: {
      bearer: {
        type: 'bearer',
        description: 'Bearer token for authenticated extended Agent Card and task operations.',
      },
      signedEnvelope: {
        type: 'custom',
        description: 'HMAC-SHA256 signed envelope for trusted runtime ingress.',
      },
    },
    metadata: {
      extended: options.includeExtended === true,
      ownsCanonicalState: false,
      canonicalStateOwner: 'Recoder Agent OS',
    },
  };
}

export function isExtendedAgentCardAuthorized(headers: Record<string, string | string[] | undefined>): boolean {
  const auth = headers['authorization'];
  const token = Array.isArray(auth) ? auth[0] : auth;
  const expected = process.env['RECODER_API_TOKEN'] ?? process.env['AGENT_GATEWAY_TOKEN'];
  return Boolean(expected && token === `Bearer ${expected}`);
}
