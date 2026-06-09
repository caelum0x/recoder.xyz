export type InstructionSourceRef = {
  path: string;
  sha256: string;
  kind?: 'agents_md' | 'claude_md' | 'codex' | 'memory' | 'policy' | 'path_rule' | 'custom';
};

export type InstructionBundleRef = {
  bundleId: string;
  taskId: string;
  agentId: string;
  runtime: string;
  sharedGoal: string;
  acceptanceCriteria: string[];
  verificationCommands: string[];
  forbiddenActions: string[];
  approvalGateIds: string[];
  memoryRefIds: string[];
  sourceRefs: InstructionSourceRef[];
  compilerVersion: string;
  compiledAt: string;
};

export type InstructionBundle = InstructionBundleRef & {
  renderedPrompt: string;
};
