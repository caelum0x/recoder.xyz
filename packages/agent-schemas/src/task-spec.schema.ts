import type { TaskSpec } from '@recoder/agent-os';
import { collectIssues, requireArray, requireString, type SchemaGuard } from './schema-guard';

export const taskSpecSchema: SchemaGuard<TaskSpec> = {
  name: 'TaskSpec',
  parse(value) {
    return collectIssues<TaskSpec>(value, 'TaskSpec', [
      (record) => requireString(record, 'taskId'),
      (record) => requireString(record, 'title'),
      (record) => requireString(record, 'intent'),
      (record) => requireString(record, 'goal'),
      (record) => requireString(record, 'spaceId'),
      (record) => requireArray(record, 'targetPaths'),
      (record) => requireArray(record, 'forbiddenPaths'),
      (record) => requireArray(record, 'acceptanceCriteria'),
      (record) => requireArray(record, 'approvalRequired'),
      (record) => requireArray(record, 'artifactRequired'),
    ]);
  },
};
