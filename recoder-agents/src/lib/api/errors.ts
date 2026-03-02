/**
 * Re-export error classes and utilities from @recoder/shared
 * This ensures consistency between frontend and mobile error handling.
 */
export {
  // Error classes
  AgentRunLimitError,
  AgentCountLimitError,
  ProjectLimitError,
  BillingError,
  TriggerLimitError,
  ModelAccessDeniedError,
  CustomWorkerLimitError,
  ThreadLimitError,
  NoAccessTokenAvailableError,
  RequestTooLargeError,
  // Parsing utilities
  parseTierRestrictionError,
  isTierRestrictionError,
  // Error state types and utilities
  extractTierLimitErrorState,
  getTierLimitErrorTitle,
  getTierLimitErrorAction,
  // UI formatting utilities
  formatTierLimitErrorForUI,
  formatTierErrorForUI,
} from '@recoder/shared/errors';

export type {
  TierErrorType,
  TierLimitErrorState,
  TierLimitErrorUI,
} from '@recoder/shared/errors';
