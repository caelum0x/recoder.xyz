/**
 * Security Package - Main Exports
 * Comprehensive security monitoring and protection
 */

export { AIPromptSanitizer, SanitizationResult, SanitizationConfig } from './ai-prompt-sanitizer';
export { CodeVulnerabilityScanner, VulnerabilityFinding, ScanResult } from './code-vulnerability-scanner';
export { SecurityMonitor, SecurityEvent, SecurityReport } from './security-monitor';
export { 
  RouterSecurityService, 
  createRouterSecurity, 
  DEFAULT_ROUTER_SECURITY_CONFIG,
  type RouterSecurityConfig,
  type RequestContext,
  type SecurityEvent as RouterSecurityEvent,
  type ThreatPattern,
  type SecurityMetrics
} from './router-security';

// Security Testing and Auditing
export {
  SecurityTestingSuite,
  createSecurityTestingSuite,
  type SecurityTest,
  type SecurityTestResult,
  type SecurityAuditReport,
  type SecurityVulnerability
} from './security-testing';

export {
  PenetrationTester,
  createPenetrationTester,
  type PenTestConfig,
  type PenTestTarget,
  type PenTestResult,
  type PenTestReport,
  type PenTestFinding
} from './penetration-testing';

export {
  SecurityAuditor,
  createSecurityAuditor,
  type SecurityAuditConfig,
  type ComprehensiveSecurityReport,
  type ConsolidatedFinding,
  type PrioritizedRecommendation,
  type ComplianceAssessment
} from './security-audit';

// Re-export commonly used types
export type { 
  VulnerabilityFinding as Vulnerability
} from './code-vulnerability-scanner';
export type {
  SecurityEvent as Event,
  SecurityReport as Report 
} from './security-monitor';