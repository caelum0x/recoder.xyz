import type { WorkLock } from '@recoder/agent-os';
import { collectIssues, requireString, type SchemaGuard } from './schema-guard';

export const workLockSchema: SchemaGuard<WorkLock> = {
  name: 'WorkLock',
  parse(value) {
    return collectIssues<WorkLock>(value, 'WorkLock', [
      (record) => requireString(record, 'lockId'),
      (record) => requireString(record, 'spaceId'),
      (record) => requireString(record, 'taskId'),
      (record) => requireString(record, 'ownerAgentId'),
      (record) => requireString(record, 'pathGlob'),
      (record) => requireString(record, 'acquiredAt'),
      (record) => requireString(record, 'expiresAt'),
    ]);
  },
};
