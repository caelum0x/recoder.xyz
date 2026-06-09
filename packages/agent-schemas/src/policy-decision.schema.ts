import type { PolicyDecision } from '@recoder/agent-os';
import { collectIssues, requireString, type SchemaGuard } from './schema-guard';

export const policyDecisionSchema: SchemaGuard<PolicyDecision> = {
  name: 'PolicyDecision',
  parse(value) {
    return collectIssues<PolicyDecision>(value, 'PolicyDecision', [
      (record) => requireString(record, 'decisionId'),
      (record) => requireString(record, 'effect'),
      (record) => requireString(record, 'action'),
      (record) => requireString(record, 'actorAgentId'),
      (record) => requireString(record, 'reason'),
      (record) => requireString(record, 'createdAt'),
    ]);
  },
};

