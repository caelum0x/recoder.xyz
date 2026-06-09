import type { AgentProfile, PolicyDecision, TaskSpec, WorkLock } from '@recoder/agent-os';
import { evaluateFileAccess } from './rules/file-access';
import { evaluateNetworkAccess } from './rules/network-access';
import { evaluateToolUse } from './rules/tool-use';
import { evaluateApprovalRequired } from './rules/approval-required';
import { evaluateSecretAccess } from './rules/secret-access';
import { evaluateCommandRisk } from './rules/command-risk';
import { evaluateMcpToolRisk } from './rules/mcp-tool-risk';
import { decision } from './decision';

export type PolicyAction =
  | 'file.read'
  | 'file.write'
  | 'command.run'
  | 'tool.call'
  | 'memory.write'
  | 'artifact.publish'
  | 'deploy.preview'
  | 'branch.push'
  | 'pr.create';

export type PolicyInput = {
  actor: AgentProfile;
  task?: TaskSpec;
  action: PolicyAction;
  target: {
    path?: string;
    command?: string;
    toolName?: string;
    environment?: string;
  };
  workLocks?: WorkLock[];
  now?: string;
};

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  return evaluateSecretAccess(input)
    ?? evaluateApprovalRequired(input)
    ?? evaluateCommandRisk(input)
    ?? evaluateMcpToolRisk(input)
    ?? evaluateNetworkAccess(input)
    ?? evaluateToolUse(input)
    ?? evaluateFileAccess(input)
    ?? decision(input, 'allow', 'Allowed by Recoder Agent OS policy.');
}
