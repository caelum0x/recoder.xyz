/**
 * Security Review Types
 *
 * Type definitions for security analysis and vulnerability findings.
 */

// Risk level classification for security findings
export type SecurityLevel = 'critical' | 'high' | 'medium' | 'low';

// Individual security finding
export interface SecurityFinding {
  title: string;
  level: SecurityLevel;
  description: string;
  risk?: string;
  solutions?: string[];
  relevantFiles?: string[];
}

// Complete security review result
export interface SecurityReviewResult {
  findings: SecurityFinding[];
  timestamp: string;
  projectId: string;
  filesAnalyzed: string[];
  summary: SecuritySummary;
}

// Summary statistics for a security review
export interface SecuritySummary {
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  overallRiskLevel: SecurityLevel | 'none';
}

// Request to perform a security review
export interface SecurityReviewRequest {
  projectId: string;
  files: FileContent[];
  options?: SecurityReviewOptions;
}

// File content for analysis
export interface FileContent {
  path: string;
  content: string;
}

// Options for customizing security review
export interface SecurityReviewOptions {
  focusAreas?: SecurityFocusArea[];
  skipFiles?: string[];
  maxFindings?: number;
}

// Areas to focus on during security review
export type SecurityFocusArea =
  | 'authentication'
  | 'authorization'
  | 'injection'
  | 'xss'
  | 'api-security'
  | 'secrets'
  | 'data-exposure'
  | 'encryption';

// Security finding with parsed details
export interface ParsedSecurityFinding extends SecurityFinding {
  rawContent: string;
  lineNumbers?: { start: number; end: number };
}

// Validation result for security types
export function isValidSecurityLevel(level: string): level is SecurityLevel {
  return ['critical', 'high', 'medium', 'low'].includes(level);
}

// Helper to create a security finding
export function createSecurityFinding(
  title: string,
  level: SecurityLevel,
  description: string,
  options?: Partial<Pick<SecurityFinding, 'risk' | 'solutions' | 'relevantFiles'>>
): SecurityFinding {
  return {
    title,
    level,
    description,
    ...options,
  };
}

// Helper to calculate overall risk level from findings
export function calculateOverallRiskLevel(findings: SecurityFinding[]): SecurityLevel | 'none' {
  if (findings.length === 0) return 'none';

  const levels: SecurityLevel[] = ['critical', 'high', 'medium', 'low'];
  for (const level of levels) {
    if (findings.some(f => f.level === level)) {
      return level;
    }
  }

  return 'none';
}

// Helper to create a summary from findings
export function createSecuritySummary(findings: SecurityFinding[]): SecuritySummary {
  return {
    totalFindings: findings.length,
    criticalCount: findings.filter(f => f.level === 'critical').length,
    highCount: findings.filter(f => f.level === 'high').length,
    mediumCount: findings.filter(f => f.level === 'medium').length,
    lowCount: findings.filter(f => f.level === 'low').length,
    overallRiskLevel: calculateOverallRiskLevel(findings),
  };
}
