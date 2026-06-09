import type { InstructionBundle } from '@recoder/agent-os';
import { collectIssues, requireArray, requireString, type SchemaGuard } from './schema-guard';

export const instructionBundleSchema: SchemaGuard<InstructionBundle> = {
  name: 'InstructionBundle',
  parse(value) {
    return collectIssues<InstructionBundle>(value, 'InstructionBundle', [
      (record) => requireString(record, 'bundleId'),
      (record) => requireString(record, 'taskId'),
      (record) => requireString(record, 'agentId'),
      (record) => requireString(record, 'runtime'),
      (record) => requireString(record, 'sharedGoal'),
      (record) => requireString(record, 'renderedPrompt'),
      (record) => requireArray(record, 'acceptanceCriteria'),
      (record) => requireArray(record, 'verificationCommands'),
      (record) => requireArray(record, 'forbiddenActions'),
      (record) => requireArray(record, 'approvalGateIds'),
      (record) => requireArray(record, 'memoryRefIds'),
      (record) => requireArray(record, 'sourceRefs'),
      (record) => requireString(record, 'compilerVersion'),
      (record) => requireString(record, 'compiledAt'),
    ]);
  },
};
