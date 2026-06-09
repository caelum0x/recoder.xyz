import type {
  ApprovalGate,
  InstructionBundle,
  MemoryRef,
} from '@recoder/a2a-sdk';

import type { InstructionCompileInput, LoadedCompileContext } from './compiler';

export function renderCodexInstructionBundle(input: {
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
    'Read AGENTS.md as canonical policy and apply the Codex override from .codex/AGENTS.md.',
    `Task: ${task.title}`,
    `Intent: ${task.intent}`,
    `Goal: ${task.goal}`,
    `Current Branch: ${compileInput.repoContext.current_branch || 'unknown'}`,
    `Target Paths: ${task.target_paths?.join(', ') || 'Not specified'}`,
    `Forbidden Paths: ${task.forbidden_paths?.join(', ') || 'None'}`,
    'Acceptance Criteria:',
    input.acceptanceCriteria.map((criterion) => `- ${criterion}`).join('\n'),
    'Verification Commands:',
    input.verificationCommands.map((command) => `- ${command}`).join('\n'),
    'Codex-Specific Rules:',
    '- Start multi-file work with a plan and keep it current.',
    '- Prefer read-only subagents for investigation.',
    '- Do not run write-heavy parallel agents on the same path group.',
    '- Treat verification commands as mandatory exit criteria.',
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
