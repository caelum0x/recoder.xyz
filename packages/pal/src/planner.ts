import type { TaskSpec } from '@recoder/agent-os';
import type { RuntimeChoice } from './agent-team';
import { estimateApprovalGates } from './approval-estimator';
import { selectRuntimeTeam } from './runtime-selector';
import { estimateTaskRisk, selectSandbox, type RiskLevel, type SandboxChoice } from './routing-policy';
import { selectSkills } from './skill-selector';
import { selectToolGrants } from './tool-grant-selector';

export type PALPlan = {
  taskId: string;
  primaryRuntime: RuntimeChoice;
  reviewerRuntime?: RuntimeChoice;
  browserVerification: boolean;
  sandbox: SandboxChoice;
  skills: string[];
  mcpTools: string[];
  approvalGateIds: string[];
  risk: RiskLevel;
  generatedAt: string;
};

export function planTask(task: TaskSpec, now = new Date().toISOString()): PALPlan {
  const team = selectRuntimeTeam(task);
  const approvals = estimateApprovalGates(task, now);

  return {
    taskId: task.taskId,
    primaryRuntime: team.primaryRuntime,
    reviewerRuntime: team.reviewerRuntime,
    browserVerification: Boolean(team.verifierRuntime) || Boolean(task.verification.browserChecks?.length),
    sandbox: selectSandbox(task),
    skills: selectSkills(task),
    mcpTools: selectToolGrants(task),
    approvalGateIds: approvals.map((approval) => approval.approvalId),
    risk: estimateTaskRisk(task),
    generatedAt: now,
  };
}
