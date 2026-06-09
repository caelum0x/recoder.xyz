import type { Approval } from '@recoder/agent-os';
import { collectIssues, requireString, type SchemaGuard } from './schema-guard';

export const approvalSchema: SchemaGuard<Approval> = {
  name: 'Approval',
  parse(value) {
    return collectIssues<Approval>(value, 'Approval', [
      (record) => requireString(record, 'approvalId'),
      (record) => requireString(record, 'taskId'),
      (record) => requireString(record, 'status'),
      (record) => requireString(record, 'reason'),
      (record) => requireString(record, 'requestedBy'),
      (record) => requireString(record, 'requestedAt'),
      (record) => requireString(record, 'requiredAt'),
    ]);
  },
};
