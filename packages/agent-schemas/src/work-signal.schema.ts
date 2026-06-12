import {
  WORK_SIGNAL_REASONS,
  WORK_SIGNAL_SEVERITIES,
  WORK_SIGNAL_SOURCES,
  WORK_SIGNAL_STATUSES,
  type WorkSignal,
} from '@recoder/agent-os';
import { collectIssues, requireString, type SchemaGuard } from './schema-guard';

const VALID_WORK_SIGNAL_REASONS = new Set<string>(WORK_SIGNAL_REASONS);
const VALID_WORK_SIGNAL_SEVERITIES = new Set<string>(WORK_SIGNAL_SEVERITIES);
const VALID_WORK_SIGNAL_SOURCES = new Set<string>(WORK_SIGNAL_SOURCES);
const VALID_WORK_SIGNAL_STATUSES = new Set<string>(WORK_SIGNAL_STATUSES);

export const workSignalSchema: SchemaGuard<WorkSignal> = {
  name: 'WorkSignal',
  parse(value) {
    return collectIssues<WorkSignal>(value, 'WorkSignal', [
      (record) => requireString(record, 'signalId'),
      (record) => requireString(record, 'taskId'),
      (record) => requireString(record, 'source'),
      (record) =>
        typeof record['source'] === 'string' && VALID_WORK_SIGNAL_SOURCES.has(record['source'])
          ? null
          : { path: 'source', message: `Expected one of: ${WORK_SIGNAL_SOURCES.join(', ')}.` },
      (record) => requireString(record, 'sourceId'),
      (record) => requireString(record, 'title'),
      (record) => requireString(record, 'severity'),
      (record) =>
        typeof record['severity'] === 'string' && VALID_WORK_SIGNAL_SEVERITIES.has(record['severity'])
          ? null
          : { path: 'severity', message: `Expected one of: ${WORK_SIGNAL_SEVERITIES.join(', ')}.` },
      (record) => requireString(record, 'status'),
      (record) =>
        typeof record['status'] === 'string' && VALID_WORK_SIGNAL_STATUSES.has(record['status'])
          ? null
          : { path: 'status', message: `Expected one of: ${WORK_SIGNAL_STATUSES.join(', ')}.` },
      (record) => requireString(record, 'detectedReason'),
      (record) =>
        typeof record['detectedReason'] === 'string' && VALID_WORK_SIGNAL_REASONS.has(record['detectedReason'])
          ? null
          : { path: 'detectedReason', message: `Expected one of: ${WORK_SIGNAL_REASONS.join(', ')}.` },
      (record) => requireString(record, 'whyItMatters'),
      (record) => requireString(record, 'recommendedNextAction'),
      (record) => requireString(record, 'agentHandoffPrompt'),
      (record) => requireString(record, 'detectedAt'),
    ]);
  },
};
