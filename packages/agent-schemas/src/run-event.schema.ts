import type { RunEvent } from '@recoder/agent-os';
import { collectIssues, requireString, type SchemaGuard } from './schema-guard';

export const runEventSchema: SchemaGuard<RunEvent> = {
  name: 'RunEvent',
  parse(value) {
    return collectIssues<RunEvent>(value, 'RunEvent', [
      (record) => requireString(record, 'eventId'),
      (record) => requireString(record, 'type'),
      (record) => requireString(record, 'taskId'),
      (record) => requireString(record, 'createdAt'),
    ]);
  },
};
