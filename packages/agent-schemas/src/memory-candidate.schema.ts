import {
  MEMORY_CANDIDATE_STATUSES,
  MEMORY_SCOPES,
  type MemoryCandidate,
} from '@recoder/agent-os';
import { collectIssues, isRecord, requireString, type SchemaGuard } from './schema-guard';

const VALID_MEMORY_SCOPES = new Set<string>(MEMORY_SCOPES);
const VALID_MEMORY_CANDIDATE_STATUSES = new Set<string>(MEMORY_CANDIDATE_STATUSES);

export const memoryCandidateSchema: SchemaGuard<MemoryCandidate> = {
  name: 'MemoryCandidate',
  parse(value) {
    return collectIssues<MemoryCandidate>(value, 'MemoryCandidate', [
      (record) => requireString(record, 'candidateId'),
      (record) => requireString(record, 'scope'),
      (record) =>
        typeof record['scope'] === 'string' && VALID_MEMORY_SCOPES.has(record['scope'])
          ? null
          : { path: 'scope', message: `Expected one of: ${MEMORY_SCOPES.join(', ')}.` },
      (record) => requireString(record, 'title'),
      (record) => requireString(record, 'body'),
      (record) => requireString(record, 'status'),
      (record) =>
        typeof record['status'] === 'string' && VALID_MEMORY_CANDIDATE_STATUSES.has(record['status'])
          ? null
          : { path: 'status', message: `Expected one of: ${MEMORY_CANDIDATE_STATUSES.join(', ')}.` },
      (record) =>
        isRecord(record['evidence'])
          ? null
          : { path: 'evidence', message: 'Expected an evidence object.' },
      (record) => {
        const evidence = record['evidence'];
        return isRecord(evidence) && typeof evidence['taskId'] === 'string' && evidence['taskId'].length > 0
          ? null
          : { path: 'evidence.taskId', message: 'Expected a non-empty string.' };
      },
      (record) => {
        const evidence = record['evidence'];
        return isRecord(evidence) && typeof evidence['artifactId'] === 'string' && evidence['artifactId'].length > 0
          ? null
          : { path: 'evidence.artifactId', message: 'Expected a non-empty string.' };
      },
      (record) => requireString(record, 'proposedBy'),
      (record) => requireString(record, 'proposedAt'),
    ]);
  },
};
