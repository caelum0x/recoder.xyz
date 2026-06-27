/**
 * RoutingCandidate — a scored, eligibility-annotated agent for a task.
 *
 * MERGED from agent-os `TaskRoutingCandidate`
 * (packages/agent-os/src/services/task-routing-service.ts). Preserves
 * `agentId, eligible, score, reasons, warnings, capabilityIds` and the
 * health/surface/runtime annotations; the agent-os fields are typed loosely as
 * strings here so coordination does not fork the agent-os AgentProfile shape
 * (the seam maps them).
 */

export type RoutingCandidate = {
  agentId: string;
  displayName: string;
  vendorSurface: string;
  runtimeKind: string;
  healthStatus: string;
  eligible: boolean;
  score: number;
  reasons: string[];
  warnings: string[];
  capabilityIds: string[];
};

export type RoutingDecision = {
  taskId: string;
  spaceId: string;
  selectedAgentId?: string;
  requestedAssigneeAgentId?: string;
  blocked: boolean;
  policyFindings: string[];
  candidates: RoutingCandidate[];
};
