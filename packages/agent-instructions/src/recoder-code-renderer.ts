import type {
  ApprovalGate,
  InstructionBundle,
  MemoryRef,
} from '@recoder/a2a-sdk';

import type { InstructionCompileInput, LoadedCompileContext } from './compiler';

export function renderRecoderCodeInstructionBundle(input: {
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
    'Treat the compiled bundle as the control-plane contract for this run.',
    `Task: ${task.title}`,
    `Intent: ${task.intent}`,
    `Goal: ${task.goal}`,
    `Workspace: ${task.space_id || 'not specified'}`,
    `Branch Policy: ${task.branch_policy || 'unspecified'}`,
    'Acceptance Criteria:',
    input.acceptanceCriteria.map((criterion) => `- ${criterion}`).join('\n'),
    'Verification Commands:',
    input.verificationCommands.map((command) => `- ${command}`).join('\n'),
    'Recoder Code Rules:',
    '- Keep artifacts and verification output attached to the run.',
    '- Respect approval gates before sensitive actions.',
    '- Update memory only through reviewed memory candidates.',
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
