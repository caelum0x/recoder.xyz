import type { AgentProfile } from '@recoder/agent-os';
import { collectIssues, requireArray, requireString, type SchemaGuard } from './schema-guard';

export const agentProfileSchema: SchemaGuard<AgentProfile> = {
  name: 'AgentProfile',
  parse(value) {
    return collectIssues<AgentProfile>(value, 'AgentProfile', [
      (record) => requireString(record, 'agentId'),
      (record) => requireString(record, 'displayName'),
      (record) => requireString(record, 'vendorSurface'),
      (record) => requireString(record, 'connectorId'),
      (record) => requireString(record, 'runtimeKind'),
      (record) => requireArray(record, 'capabilities'),
      (record) => requireArray(record, 'tools'),
      (record) => requireArray(record, 'supportedTaskIntents'),
    ]);
  },
};
