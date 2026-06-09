import type { AgentProfile, Space, TaskRun, TaskSpec } from '../domain';

export type TaskRoutingRequest = {
  task: TaskSpec;
  agents: AgentProfile[];
  space?: Space;
  requestedAssigneeAgentId?: string;
  requiredCapabilityIds?: string[];
};

export type TaskRoutingCandidate = {
  agentId: string;
  displayName: string;
  vendorSurface: AgentProfile['vendorSurface'];
  runtimeKind: AgentProfile['runtimeKind'];
  healthStatus: AgentProfile['health']['status'];
  eligible: boolean;
  score: number;
  reasons: string[];
  warnings: string[];
  capabilityIds: string[];
};

export type TaskRoute = {
  taskId: string;
  spaceId: string;
  selectedAgentId?: string;
  requestedAssigneeAgentId?: string;
  blocked: boolean;
  policyFindings: string[];
  candidates: TaskRoutingCandidate[];
};

export type ApplyTaskRouteInput = {
  run: TaskRun;
  route: TaskRoute;
  now?: string;
};

export class TaskRoutingService {
  route(input: TaskRoutingRequest): TaskRoute {
    const policyFindings = this.spacePolicyFindings(input.task, input.space);
    const candidates = input.agents
      .map((agent) => this.candidate(input, agent, policyFindings))
      .sort(compareCandidates);
    const selected = candidates.find((candidate) => candidate.eligible);

    return {
      taskId: input.task.taskId,
      spaceId: input.task.spaceId,
      selectedAgentId: selected?.agentId,
      requestedAssigneeAgentId: input.requestedAssigneeAgentId,
      blocked: policyFindings.length > 0 || !selected,
      policyFindings,
      candidates,
    };
  }

  private candidate(input: TaskRoutingRequest, agent: AgentProfile, policyFindings: string[]): TaskRoutingCandidate {
    const reasons: string[] = [];
    const warnings: string[] = [];
    const capabilityIds = agent.capabilities.map((capability) => capability.capabilityId);
    let score = 0;

    if (!isHealthy(agent)) {
      reasons.push(`agent health is ${agent.health.status}`);
    } else {
      score += agent.health.status === 'healthy' ? 30 : 15;
    }

    if (input.requestedAssigneeAgentId && input.requestedAssigneeAgentId !== agent.agentId) {
      reasons.push(`requested assignee is ${input.requestedAssigneeAgentId}`);
    } else if (input.requestedAssigneeAgentId === agent.agentId) {
      score += 50;
    }

    if (!supportsIntent(agent, input.task.intent)) {
      reasons.push(`unsupported intent: ${input.task.intent}`);
    } else {
      score += 30;
    }

    const missingCapabilities = (input.requiredCapabilityIds ?? [])
      .filter((capabilityId) => !capabilityIds.includes(capabilityId));
    if (missingCapabilities.length > 0) {
      reasons.push(`missing capabilities: ${missingCapabilities.join(', ')}`);
    } else {
      score += (input.requiredCapabilityIds ?? []).length * 10;
    }

    const writeExpected = input.task.branchPolicy !== 'no_git_write' && input.task.intent !== 'code_review' && input.task.intent !== 'research';
    if (writeExpected && !agent.permissions.allowGitWrite) {
      reasons.push('git write is not allowed by agent policy');
    }
    if (input.task.metadata?.requiresNetwork === true && !agent.permissions.allowNetwork) {
      reasons.push('network is not allowed by agent policy');
    }
    if (input.task.metadata?.requiresShell === true && !agent.permissions.allowShell) {
      reasons.push('shell is not allowed by agent policy');
    }
    if (input.space && input.space.spaceId !== input.task.spaceId) {
      reasons.push(`space mismatch: ${input.space.spaceId}`);
    }
    if (policyFindings.length > 0) {
      reasons.push('workspace policy blocks this task');
    }

    score += agent.capabilities.length;
    if (agent.runtimeKind === 'local') {
      warnings.push('local runtime requires live bridge/session health outside this routing decision');
    }
    if (agent.approvalPolicy.mode === 'manual') {
      warnings.push('agent approval mode is manual');
    }

    return {
      agentId: agent.agentId,
      displayName: agent.displayName,
      vendorSurface: agent.vendorSurface,
      runtimeKind: agent.runtimeKind,
      healthStatus: agent.health.status,
      eligible: reasons.length === 0,
      score: reasons.length === 0 ? score : 0,
      reasons,
      warnings,
      capabilityIds,
    };
  }

  private spacePolicyFindings(task: TaskSpec, space?: Space): string[] {
    if (!space) {
      return [];
    }

    const findings: string[] = [];
    const forbiddenPaths = new Set([...(space.policy.forbiddenPaths ?? []), ...task.forbiddenPaths]);
    for (const targetPath of task.targetPaths) {
      for (const forbiddenPath of forbiddenPaths) {
        if (pathMatchesRule(targetPath, forbiddenPath)) {
          findings.push(`target path ${targetPath} is blocked by ${forbiddenPath}`);
        }
      }
    }
    return findings;
  }
}

function compareCandidates(left: TaskRoutingCandidate, right: TaskRoutingCandidate): number {
  if (left.eligible !== right.eligible) {
    return left.eligible ? -1 : 1;
  }
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  return left.agentId.localeCompare(right.agentId);
}

function isHealthy(agent: AgentProfile): boolean {
  return agent.health.status === 'healthy' || agent.health.status === 'degraded';
}

function supportsIntent(agent: AgentProfile, intent: TaskSpec['intent']): boolean {
  return agent.supportedTaskIntents.includes(intent) || agent.supportedTaskIntents.includes('*');
}

function pathMatchesRule(path: string, rule: string): boolean {
  if (rule.length === 0) {
    return false;
  }
  if (rule.endsWith('/**')) {
    return path === rule.slice(0, -3) || path.startsWith(rule.slice(0, -2));
  }
  if (rule.includes('*')) {
    const doubleStarToken = '___RECODER_DOUBLE_STAR___';
    const escaped = rule
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, doubleStarToken)
      .replace(/\*/g, '[^/]*');
    return new RegExp(`^${escaped.replaceAll(doubleStarToken, '.*')}$`).test(path);
  }
  return path === rule || path.startsWith(`${rule}/`);
}
