import { ARTIFACT_KINDS, type Artifact } from '@recoder/agent-os';
import { collectIssues, requireString, type SchemaGuard } from './schema-guard';

const VALID_ARTIFACT_KINDS = new Set<string>(ARTIFACT_KINDS);

export const artifactSchema: SchemaGuard<Artifact> = {
  name: 'Artifact',
  parse(value) {
    return collectIssues<Artifact>(value, 'Artifact', [
      (record) => requireString(record, 'artifactId'),
      (record) => requireString(record, 'taskId'),
      (record) => requireString(record, 'kind'),
      (record) =>
        typeof record.kind === 'string' && VALID_ARTIFACT_KINDS.has(record.kind)
          ? null
          : { path: 'kind', message: `Expected one of: ${ARTIFACT_KINDS.join(', ')}.` },
      (record) => requireString(record, 'mimeType'),
      (record) =>
        typeof record.public === 'boolean'
          ? null
          : { path: 'public', message: 'Expected a boolean.' },
      (record) => requireString(record, 'createdAt'),
      (record) => requireString(record, 'createdBy'),
    ]);
  },
};
