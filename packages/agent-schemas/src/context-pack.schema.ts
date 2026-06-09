import type { ContextPack } from '@recoder/git-nexus';
import { collectIssues, requireArray, requireString, type SchemaGuard } from './schema-guard';

export const contextPackSchema: SchemaGuard<ContextPack> = {
  name: 'ContextPack',
  parse(value) {
    return collectIssues<ContextPack>(value, 'ContextPack', [
      (record) => requireString(record, 'taskId'),
      (record) => requireArray(record, 'sourceRefs'),
    ]);
  },
};

