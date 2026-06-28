// Re-export the upstream agent-policy rules (composed, not absorbed) plus the
// two governance-only rules. The upstream rules stay owned by
// @recoder/agent-policy; we add stricter ones on top.
export {
  evaluateFileAccess,
  evaluateSecretAccess,
  evaluateNetworkAccess,
  evaluateToolUse,
  evaluateCommandRisk,
  evaluateMcpToolRisk,
  evaluateApprovalRequired,
  globMatch,
} from '@recoder/agent-policy';

export * from './work-lock';
export * from './forbidden-path';
