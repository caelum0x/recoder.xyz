import { collectIssues, requireArray, requireString, type SchemaGuard } from './schema-guard';

type ContextPack = {
  taskId: string;
  sourceRefs: Array<Record<string, unknown>>;
};

export const contextPackSchema: SchemaGuard<ContextPack> = {
  name: 'ContextPack',
  parse(value) {
    return collectIssues<ContextPack>(value, 'ContextPack', [
      (record) => requireString(record, 'taskId'),
      (record) => requireArray(record, 'sourceRefs'),
    ]);
  },
};
