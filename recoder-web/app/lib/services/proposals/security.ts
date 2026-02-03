/**
 * Security Assessment for Proposals
 *
 * This module provides security risk assessment for code proposals.
 * It analyzes file changes, SQL queries, and shell commands for potential risks.
 */

import type {
  SecurityRisk,
  SecurityAssessment,
  SecurityRule,
  FileChange,
  SqlQuery,
} from './types';
import { getFileExtension, isServerFunction } from './tag-parser';

// =============================================================================
// Security Rules
// =============================================================================

const FILE_SECURITY_RULES: SecurityRule[] = [
  // Environment files
  {
    id: 'env-file',
    name: 'Environment File Modification',
    description: 'Modifying environment files could expose sensitive credentials',
    level: 'danger',
    check: (change) => {
      if (typeof change === 'string') return false;
      if (!('path' in change)) return false;
      const path = change.path.toLowerCase();
      return /\.env($|\.local|\.production|\.development)/.test(path);
    },
  },
  // Credentials and secrets
  {
    id: 'credentials-file',
    name: 'Credentials File',
    description: 'File may contain sensitive credentials or API keys',
    level: 'danger',
    check: (change) => {
      if (typeof change === 'string') return false;
      if (!('path' in change)) return false;
      const path = change.path.toLowerCase();
      return (
        /credentials|secrets?|keys?|tokens?|password/i.test(path) ||
        /\.pem$|\.key$|\.p12$|\.pfx$/.test(path)
      );
    },
  },
  // Configuration files
  {
    id: 'config-file',
    name: 'Configuration File',
    description: 'Modifying configuration files could affect application behavior',
    level: 'warning',
    check: (change) => {
      if (typeof change === 'string') return false;
      if (!('path' in change)) return false;
      const path = change.path.toLowerCase();
      return (
        /config\.(ts|js|json|yaml|yml)$/.test(path) ||
        /tsconfig|eslintrc|prettierrc|babelrc/.test(path) ||
        path === 'package.json'
      );
    },
  },
  // Server-side code
  {
    id: 'server-code',
    name: 'Server-Side Code',
    description: 'Modifying server-side code could affect security and data handling',
    level: 'warning',
    check: (change) => {
      if (typeof change === 'string') return false;
      if (!('path' in change)) return false;
      return isServerFunction(change.path);
    },
  },
  // Authentication/Authorization code
  {
    id: 'auth-code',
    name: 'Authentication Code',
    description: 'Modifying authentication code could compromise security',
    level: 'danger',
    check: (change) => {
      if (typeof change === 'string') return false;
      if (!('path' in change)) return false;
      const path = change.path.toLowerCase();
      return /auth|login|logout|session|jwt|oauth|middleware\/auth/.test(path);
    },
  },
  // Database migrations
  {
    id: 'migration-file',
    name: 'Database Migration',
    description: 'Database migrations can permanently alter data structure',
    level: 'warning',
    check: (change) => {
      if (typeof change === 'string') return false;
      if (!('path' in change)) return false;
      const path = change.path.toLowerCase();
      return /migrations?\/|\.migration\.|schema\./.test(path);
    },
  },
  // Build/deployment configuration
  {
    id: 'build-config',
    name: 'Build Configuration',
    description: 'Changes to build configuration affect deployment',
    level: 'warning',
    check: (change) => {
      if (typeof change === 'string') return false;
      if (!('path' in change)) return false;
      const path = change.path.toLowerCase();
      return (
        /dockerfile|docker-compose|\.github|vercel\.json|netlify\.toml|wrangler\.toml/.test(
          path
        ) || /vite\.config|next\.config|webpack\.config/.test(path)
      );
    },
  },
  // Large file write
  {
    id: 'large-file',
    name: 'Large File',
    description: 'Large files may need to be split for better maintainability',
    level: 'warning',
    check: (change) => {
      if (typeof change === 'string') return false;
      if (!('path' in change)) return false;
      // This is a placeholder - actual implementation would check content length
      return false;
    },
  },
];

const SQL_SECURITY_RULES: SecurityRule[] = [
  // DROP statements
  {
    id: 'sql-drop',
    name: 'DROP Statement',
    description: 'DROP statements permanently delete database objects',
    level: 'danger',
    check: (query) => {
      if (typeof query !== 'object' || !('content' in query)) return false;
      return /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|FUNCTION)/i.test(
        query.content
      );
    },
  },
  // DELETE without WHERE
  {
    id: 'sql-delete-all',
    name: 'DELETE Without WHERE',
    description: 'DELETE without WHERE clause will delete all rows',
    level: 'danger',
    check: (query) => {
      if (typeof query !== 'object' || !('content' in query)) return false;
      const content = query.content.toLowerCase();
      return (
        /\bDELETE\s+FROM\b/i.test(content) && !/\bWHERE\b/i.test(content)
      );
    },
  },
  // TRUNCATE statements
  {
    id: 'sql-truncate',
    name: 'TRUNCATE Statement',
    description: 'TRUNCATE will delete all data from the table',
    level: 'danger',
    check: (query) => {
      if (typeof query !== 'object' || !('content' in query)) return false;
      return /\bTRUNCATE\s+TABLE\b/i.test(query.content);
    },
  },
  // ALTER TABLE
  {
    id: 'sql-alter',
    name: 'ALTER TABLE Statement',
    description: 'ALTER TABLE can change table structure',
    level: 'warning',
    check: (query) => {
      if (typeof query !== 'object' || !('content' in query)) return false;
      return /\bALTER\s+TABLE\b/i.test(query.content);
    },
  },
  // Raw user input (potential SQL injection)
  {
    id: 'sql-raw-input',
    name: 'Potential SQL Injection',
    description: 'Query may be vulnerable to SQL injection',
    level: 'danger',
    check: (query) => {
      if (typeof query !== 'object' || !('content' in query)) return false;
      // Check for common injection patterns
      return /\$\{|' \+ |" \+ |concat\(|CONCAT\(/i.test(query.content);
    },
  },
  // Grant/Revoke permissions
  {
    id: 'sql-permissions',
    name: 'Permission Change',
    description: 'Changing database permissions affects access control',
    level: 'danger',
    check: (query) => {
      if (typeof query !== 'object' || !('content' in query)) return false;
      return /\b(GRANT|REVOKE)\b/i.test(query.content);
    },
  },
];

const COMMAND_SECURITY_RULES: SecurityRule[] = [
  // rm -rf
  {
    id: 'cmd-rm-rf',
    name: 'Dangerous rm Command',
    description: 'rm -rf can permanently delete files and directories',
    level: 'danger',
    check: (cmd) => {
      if (typeof cmd !== 'string') return false;
      return /\brm\s+(-[^\s]*r[^\s]*|-[^\s]*f[^\s]*)\s+\//.test(cmd);
    },
  },
  // sudo
  {
    id: 'cmd-sudo',
    name: 'Elevated Privileges',
    description: 'Command requires elevated privileges',
    level: 'danger',
    check: (cmd) => {
      if (typeof cmd !== 'string') return false;
      return /\bsudo\b/.test(cmd);
    },
  },
  // curl/wget to sh
  {
    id: 'cmd-pipe-sh',
    name: 'Remote Script Execution',
    description: 'Executing remote scripts can be dangerous',
    level: 'danger',
    check: (cmd) => {
      if (typeof cmd !== 'string') return false;
      return /\b(curl|wget)\b.*\|\s*(bash|sh|zsh)/.test(cmd);
    },
  },
  // Environment variable manipulation
  {
    id: 'cmd-env',
    name: 'Environment Modification',
    description: 'Modifying environment variables',
    level: 'warning',
    check: (cmd) => {
      if (typeof cmd !== 'string') return false;
      return /\bexport\b.*=/.test(cmd);
    },
  },
  // Network commands
  {
    id: 'cmd-network',
    name: 'Network Command',
    description: 'Command accesses network resources',
    level: 'warning',
    check: (cmd) => {
      if (typeof cmd !== 'string') return false;
      return /\b(nc|netcat|nmap|ssh|scp|rsync)\b/.test(cmd);
    },
  },
];

// =============================================================================
// Assessment Functions
// =============================================================================

/**
 * Assess security risks for a single file change.
 */
export function assessFileChangeRisks(change: FileChange): SecurityRisk[] {
  const risks: SecurityRisk[] = [];

  for (const rule of FILE_SECURITY_RULES) {
    if (rule.check(change)) {
      risks.push({
        type: rule.level,
        title: rule.name,
        description: rule.description,
      });
    }
  }

  return risks;
}

/**
 * Assess security risks for a SQL query.
 */
export function assessSqlQueryRisks(query: SqlQuery): SecurityRisk[] {
  const risks: SecurityRisk[] = [];

  for (const rule of SQL_SECURITY_RULES) {
    if (rule.check(query)) {
      risks.push({
        type: rule.level,
        title: rule.name,
        description: rule.description,
      });
    }
  }

  return risks;
}

/**
 * Assess security risks for a shell command.
 */
export function assessCommandRisks(command: string): SecurityRisk[] {
  const risks: SecurityRisk[] = [];

  for (const rule of COMMAND_SECURITY_RULES) {
    if (rule.check(command)) {
      risks.push({
        type: rule.level,
        title: rule.name,
        description: rule.description,
      });
    }
  }

  return risks;
}

/**
 * Assess all security risks for a code proposal.
 */
export function assessProposalSecurity(
  filesChanged: FileChange[],
  sqlQueries: SqlQuery[],
  shellCommands: string[] = []
): SecurityAssessment {
  const risks: SecurityRisk[] = [];

  // Assess file changes
  for (const change of filesChanged) {
    risks.push(...assessFileChangeRisks(change));
  }

  // Assess SQL queries
  for (const query of sqlQueries) {
    risks.push(...assessSqlQueryRisks(query));
  }

  // Assess shell commands
  for (const command of shellCommands) {
    risks.push(...assessCommandRisks(command));
  }

  // Deduplicate risks by title
  const uniqueRisks = risks.filter(
    (risk, index, self) =>
      index === self.findIndex((r) => r.title === risk.title)
  );

  // Determine overall risk level
  const hasDanger = uniqueRisks.some((r) => r.type === 'danger');
  const hasWarning = uniqueRisks.some((r) => r.type === 'warning');

  let overallRisk: SecurityAssessment['overallRisk'] = 'none';
  if (hasDanger) {
    overallRisk = 'high';
  } else if (hasWarning) {
    overallRisk = hasWarning && uniqueRisks.length > 2 ? 'medium' : 'low';
  }

  return {
    risks: uniqueRisks,
    overallRisk,
    requiresReview: hasDanger || (hasWarning && uniqueRisks.length > 1),
  };
}

/**
 * Get a human-readable summary of security risks.
 */
export function getSecuritySummary(assessment: SecurityAssessment): string {
  if (assessment.risks.length === 0) {
    return 'No security risks detected';
  }

  const dangerCount = assessment.risks.filter((r) => r.type === 'danger').length;
  const warningCount = assessment.risks.filter(
    (r) => r.type === 'warning'
  ).length;

  const parts: string[] = [];
  if (dangerCount > 0) {
    parts.push(`${dangerCount} high-risk issue${dangerCount > 1 ? 's' : ''}`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
  }

  return parts.join(' and ');
}

/**
 * Format security risks for display.
 */
export function formatSecurityRisks(risks: SecurityRisk[]): string {
  if (risks.length === 0) return '';

  return risks
    .map((risk) => {
      const icon = risk.type === 'danger' ? '!!!' : '!';
      return `[${icon}] ${risk.title}: ${risk.description}`;
    })
    .join('\n');
}
