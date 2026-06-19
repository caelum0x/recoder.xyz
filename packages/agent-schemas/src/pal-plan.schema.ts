import { collectIssues, requireArray, requireString, type SchemaGuard } from './schema-guard';

type PALPlan = {
  taskId: string;
  primaryRuntime: string;
  reviewerRuntime?: string;
  browserVerification: boolean;
  sandbox: string;
  skills: string[];
  mcpTools: string[];
  mcpToolGrants: Array<{
    serverId: string;
    toolName: string;
    mode?: string;
    reason?: string;
  }>;
  approvalGateIds: string[];
  risk: string;
  generatedAt: string;
};

function requireMcpToolGrants(record: Record<string, unknown>) {
  const grants = record['mcpToolGrants'];
  if (!Array.isArray(grants)) {
    return { path: 'mcpToolGrants', message: 'Expected an array.' };
  }
  const invalidIndex = grants.findIndex((grant) => {
    if (typeof grant !== 'object' || grant === null || Array.isArray(grant)) {
      return true;
    }
    const grantRecord = grant as Record<string, unknown>;
    return (
      typeof grantRecord['serverId'] !== 'string' ||
      typeof grantRecord['toolName'] !== 'string' ||
      grantRecord['serverId'] === '' ||
      grantRecord['toolName'] === ''
    );
  });
  return invalidIndex === -1
    ? null
    : {
        path: `mcpToolGrants.${invalidIndex}`,
        message: 'Expected a grant with non-empty serverId and toolName.',
      };
}

export const palPlanSchema: SchemaGuard<PALPlan> = {
  name: 'PALPlan',
  parse(value) {
    return collectIssues<PALPlan>(value, 'PALPlan', [
      (record) => requireString(record, 'taskId'),
      (record) => requireString(record, 'primaryRuntime'),
      (record) => requireString(record, 'sandbox'),
      (record) => requireArray(record, 'skills'),
      (record) => requireArray(record, 'mcpTools'),
      requireMcpToolGrants,
      (record) => requireArray(record, 'approvalGateIds'),
      (record) => requireString(record, 'risk'),
      (record) => requireString(record, 'generatedAt'),
    ]);
  },
};
