import type { InstructionBundle } from '@recoder/a2a-sdk';
import type { InstructionCompileInput, LoadedCompileContext } from '../compiler';

export function renderGenericInstructionBundle(input: {
  compileInput: InstructionCompileInput;
  context: LoadedCompileContext;
  acceptanceCriteria: string[];
  verificationCommands: string[];
  forbiddenActions: string[];
}): Omit<InstructionBundle, 'provenance'> {
  return {
    shared_goal: input.compileInput.task.goal,
    agent_specific_prompt: [
      `Task: ${input.compileInput.task.title}`,
      `Goal: ${input.compileInput.task.goal}`,
      'Acceptance Criteria:',
      input.acceptanceCriteria.map((criterion) => `- ${criterion}`).join('\n'),
      'Verification Commands:',
      input.verificationCommands.map((command) => `- ${command}`).join('\n'),
    ].join('\n'),
    system_context_refs: input.context.sources.map((source) => source.ref),
    acceptance_criteria: input.acceptanceCriteria,
    verification_commands: input.verificationCommands,
    forbidden_actions: input.forbiddenActions,
    approval_gates: [],
    memory_used: [],
  };
}
