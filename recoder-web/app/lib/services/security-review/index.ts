/**
 * Security Review Module
 *
 * Provides automated security analysis for code files, including:
 * - Static pattern-based vulnerability detection
 * - AI-powered security review
 * - Risk level classification
 * - Finding management and history tracking
 */

// Types
export type {
  SecurityLevel,
  SecurityFinding,
  SecurityReviewResult,
  SecuritySummary,
  SecurityReviewRequest,
  SecurityReviewOptions,
  FileContent,
  SecurityFocusArea,
  ParsedSecurityFinding,
} from './types';

// Type utilities
export {
  isValidSecurityLevel,
  createSecurityFinding,
  calculateOverallRiskLevel,
  createSecuritySummary,
} from './types';

// Prompts
export {
  SECURITY_REVIEW_SYSTEM_PROMPT,
  SECURITY_REVIEW_USER_PROMPT,
  generateFocusedSecurityPrompt,
  generateSummaryPrompt,
} from './prompts';

// Parser
export {
  parseSecurityFindings,
  toSecurityFinding,
  formatSecurityFinding,
  sortFindingsBySeverity,
  groupFindingsByLevel,
  groupFindingsByFile,
} from './parser';

// Analyzer
export {
  analyzeFilesForSecurity,
  quickSecurityCheck,
  getSeverityScore,
  calculateSecurityScore,
} from './analyzer';

// Main service
export {
  performSecurityReview,
  getLatestSecurityReview,
  getSecurityReviewHistory,
  clearSecurityReviewHistory,
  getGlobalSecuritySummary,
  quickSecurityScan,
  needsSecurityReview,
} from './security-review-service';

// React hooks
export {
  useSecurityReview,
  useSecurityFindings,
  useSecurityReviewWithAI,
} from './useSecurityReview';

export type { UseSecurityReviewOptions, UseSecurityReviewReturn } from './useSecurityReview';
