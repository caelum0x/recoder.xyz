import type { PALPlan } from '@recoder/pal';
import { collectIssues, requireArray, requireString, type SchemaGuard } from './schema-guard';

export const palPlanSchema: SchemaGuard<PALPlan> = {
  name: 'PALPlan',
  parse(value) {
    return collectIssues<PALPlan>(value, 'PALPlan', [
      (record) => requireString(record, 'taskId'),
      (record) => requireString(record, 'primaryRuntime'),
      (record) => requireString(record, 'sandbox'),
      (record) => requireArray(record, 'skills'),
      (record) => requireArray(record, 'mcpTools'),
      (record) => requireArray(record, 'approvalGateIds'),
      (record) => requireString(record, 'risk'),
      (record) => requireString(record, 'generatedAt'),
    ]);
  },
};

