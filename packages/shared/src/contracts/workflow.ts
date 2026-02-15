/**
 * Shared workflow contract version constants.
 *
 * All consumers (openclaw, docker-backend, desktop, recoder-web) should
 * import and reference these constants so parity checks can compare
 * versions instead of brittle string-matching.
 */

export const WORKFLOW_CONTRACT_VERSION = "internal-agent-workflow-v1" as const;
export const PUBLIC_WORKFLOW_CONTRACT_VERSION = "public-agent-workflow-v1" as const;

export type WorkflowContractVersion =
  | typeof WORKFLOW_CONTRACT_VERSION
  | typeof PUBLIC_WORKFLOW_CONTRACT_VERSION;
