import type {
  ApprovalGate,
  InstructionBundle,
  MemoryRef,
} from '@recoder/a2a-sdk';

import type {
  FailurePattern,
  InstructionCompileInput,
  LoadedCompileContext,
  PathInstructionRule,
} from './compiler';

function renderPathRules(pathRules: PathInstructionRule[]): string {
  if (pathRules.length === 0) return 'None';
  return pathRules.map((rule) => `- ${rule.glob}: ${rule.instruction}`).join('\n');
}

function renderFailures(failures: FailurePattern[]): string {
  if (failures.length === 0) return 'None';
  return failures.map((failure) => `- ${failure.summary}: ${failure.guidance}`).join('\n');
}

function renderMemory(memory: MemoryRef[]): string {
  if (memory.length === 0) return 'None';
  return memory.map((item) => `- [${item.scope}] ${item.title}`).join('\n');
}

export function renderClaudeInstructionBundle(input: {
  compileInput: InstructionCompileInput;
  context: LoadedCompileContext;
  acceptanceCriteria: string[];
  verificationCommands: string[];
  forbiddenActions: string[];
  approvalGates: ApprovalGate[];
  memoryUsed: MemoryRef[];
}): Omit<InstructionBundle, 'provenance'> {
  const { compileInput, context } = input;
  const task = compileInput.task;

  const agentSpecificPrompt = [
    'Follow CLAUDE.md and the imported AGENTS.md as canonical repo policy.',
    `Task: ${task.title}`,
    `Intent: ${task.intent}`,
    `Goal: ${task.goal}`,
    `Repo Root: ${compileInput.repoContext.repo_root}`,
    `Target Paths: ${task.target_paths?.join(', ') || 'Not specified'}`,
    `Forbidden Paths: ${task.forbidden_paths?.join(', ') || 'None'}`,
    'Acceptance Criteria:',
    input.acceptanceCriteria.map((criterion) => `- ${criterion}`).join('\n'),
    'Verification Commands:',
    input.verificationCommands.map((command) => `- ${command}`).join('\n'),
    'Path Rules:',
    renderPathRules(compileInput.pathRules),
    'Recent Failure Patterns:',
    renderFailures(compileInput.recentFailures),
    'Memory Used:',
    renderMemory(input.memoryUsed),
    'Claude-Specific Rules:',
    '- Prefer Recoder skills and deterministic verification plans over open-ended prompting.',
    '- Use subagents for read-heavy analysis unless a write lock is granted.',
    '- Do not write durable memory directly; emit a memory candidate artifact.',
  ].join('\n');

  return {
    shared_goal: task.goal,
    agent_specific_prompt: agentSpecificPrompt,
    system_context_refs: context.sources.map((source) => source.ref),
    acceptance_criteria: input.acceptanceCriteria,
    verification_commands: input.verificationCommands,
    forbidden_actions: input.forbiddenActions,
    approval_gates: input.approvalGates,
    memory_used: input.memoryUsed,
  };
}
