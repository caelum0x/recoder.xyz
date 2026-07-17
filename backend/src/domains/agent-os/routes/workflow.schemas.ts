/**
 * Boundary zod schema for the `/api/agent-os/workflows` CRUD edge. Mirrors the
 * frozen `@recoder/agent-workflows` `WorkflowDefinition` shape 1:1 (structure
 * only — dependency legality stays with the package's `validateWorkflowDefinition`,
 * which the service runs before persisting). api rule: validate at the boundary,
 * never trust external data.
 */
import { z } from 'zod';

/** The frozen `WorkflowNodeKind` union (kept in sync with `@recoder/agent-workflows`). */
const WORKFLOW_NODE_KINDS = [
  'agent', 'tool', 'condition', 'parallel', 'approval', 'approval-wait',
  'verification', 'memory', 'artifact', 'pull-request', 'deploy', 'browser-check',
] as const;

/** Task intents a workflow may be tagged with (mirrors the agent-os TaskSpec union). */
const TASK_INTENTS = [
  'bugfix', 'feature_delivery', 'platform_hardening', 'refactor', 'code_review',
  'test_generation', 'verification', 'documentation', 'research', 'release',
  'incident_response', 'migration', 'handoff', 'custom',
] as const;

const workflowNodeSchema = z.object({
  nodeId: z.string().min(1),
  kind: z.enum(WORKFLOW_NODE_KINDS),
  label: z.string().min(1),
  dependsOn: z.array(z.string().min(1)).optional(),
  config: z.record(z.unknown()).default({}),
});

export const workflowDefinitionSchema = z.object({
  workflowId: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  taskIntent: z.enum(TASK_INTENTS).optional(),
  nodes: z.array(workflowNodeSchema).min(1),
  metadata: z.record(z.unknown()).optional(),
});

export const workflowIdParamSchema = z.object({ workflowId: z.string().min(1) });
