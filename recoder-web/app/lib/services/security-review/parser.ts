/**
 * Security Finding Parser
 *
 * Parses AI-generated security review responses into structured findings.
 */

import type { SecurityFinding, SecurityLevel, ParsedSecurityFinding } from './types';
import { isValidSecurityLevel } from './types';

// Regex to match security finding blocks
const FINDING_REGEX = /<security-finding\s+title="([^"]+)"\s+level="([^"]+)">([\s\S]*?)<\/security-finding>/gi;

// Regex patterns for extracting finding details
const WHAT_REGEX = /\*\*What\*\*:\s*([\s\S]*?)(?=\*\*Risk\*\*:|$)/i;
const RISK_REGEX = /\*\*Risk\*\*:\s*([\s\S]*?)(?=\*\*Potential Solutions\*\*:|$)/i;
const SOLUTIONS_REGEX = /\*\*Potential Solutions\*\*:\s*([\s\S]*?)(?=\*\*Relevant Files\*\*:|$)/i;
const FILES_REGEX = /\*\*Relevant Files\*\*:\s*([\s\S]*?)$/i;

/**
 * Parses a security review response into structured findings
 */
export function parseSecurityFindings(response: string): ParsedSecurityFinding[] {
  const findings: ParsedSecurityFinding[] = [];
  let match: RegExpExecArray | null;

  // Reset regex lastIndex
  FINDING_REGEX.lastIndex = 0;

  while ((match = FINDING_REGEX.exec(response)) !== null) {
    const [rawContent, title, levelStr, content] = match;
    const level = normalizeSecurityLevel(levelStr);

    if (!level) {
      console.warn(`Invalid security level "${levelStr}" for finding "${title}"`);
      continue;
    }

    const finding = parseFindingContent(title, level, content.trim(), rawContent);
    findings.push(finding);
  }

  return findings;
}

/**
 * Normalizes a security level string to a valid SecurityLevel
 */
function normalizeSecurityLevel(level: string): SecurityLevel | null {
  const normalized = level.toLowerCase().trim();
  if (isValidSecurityLevel(normalized)) {
    return normalized;
  }
  return null;
}

/**
 * Parses the content of a security finding block
 */
function parseFindingContent(
  title: string,
  level: SecurityLevel,
  content: string,
  rawContent: string
): ParsedSecurityFinding {
  // Extract description (What section)
  const whatMatch = content.match(WHAT_REGEX);
  const description = whatMatch ? whatMatch[1].trim() : content;

  // Extract risk
  const riskMatch = content.match(RISK_REGEX);
  const risk = riskMatch ? riskMatch[1].trim() : undefined;

  // Extract solutions
  const solutionsMatch = content.match(SOLUTIONS_REGEX);
  const solutions = solutionsMatch ? parseSolutionsList(solutionsMatch[1]) : undefined;

  // Extract relevant files
  const filesMatch = content.match(FILES_REGEX);
  const relevantFiles = filesMatch ? parseFilesList(filesMatch[1]) : undefined;

  return {
    title,
    level,
    description,
    risk,
    solutions,
    relevantFiles,
    rawContent,
  };
}

/**
 * Parses a numbered or bulleted list of solutions
 */
function parseSolutionsList(solutionsText: string): string[] {
  const lines = solutionsText.split('\n');
  const solutions: string[] = [];

  for (const line of lines) {
    // Match numbered items (1. 2. 3.) or bullet points (- *)
    const match = line.match(/^\s*(?:\d+\.|\-|\*)\s*(.+)/);
    if (match && match[1].trim()) {
      solutions.push(match[1].trim());
    }
  }

  return solutions.length > 0 ? solutions : [solutionsText.trim()];
}

/**
 * Parses a list of file paths from text
 */
function parseFilesList(filesText: string): string[] {
  const files: string[] = [];

  // Match backtick-wrapped paths or plain paths
  const backtickMatches = Array.from(filesText.matchAll(/`([^`]+)`/g));
  for (const match of backtickMatches) {
    files.push(match[1].trim());
  }

  // If no backtick-wrapped paths, try to extract paths from comma-separated or newline-separated list
  if (files.length === 0) {
    const pathMatches = Array.from(filesText.matchAll(/(?:^|\s|,)([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/g));
    for (const match of pathMatches) {
      files.push(match[1].trim());
    }
  }

  return files;
}

/**
 * Converts ParsedSecurityFinding to basic SecurityFinding
 */
export function toSecurityFinding(parsed: ParsedSecurityFinding): SecurityFinding {
  return {
    title: parsed.title,
    level: parsed.level,
    description: parsed.description,
    risk: parsed.risk,
    solutions: parsed.solutions,
    relevantFiles: parsed.relevantFiles,
  };
}

/**
 * Formats a security finding for display
 */
export function formatSecurityFinding(finding: SecurityFinding): string {
  let output = `## ${getLevelEmoji(finding.level)} ${finding.title} [${finding.level.toUpperCase()}]\n\n`;
  output += `**Description:** ${finding.description}\n\n`;

  if (finding.risk) {
    output += `**Risk:** ${finding.risk}\n\n`;
  }

  if (finding.solutions && finding.solutions.length > 0) {
    output += '**Solutions:**\n';
    finding.solutions.forEach((solution, index) => {
      output += `${index + 1}. ${solution}\n`;
    });
    output += '\n';
  }

  if (finding.relevantFiles && finding.relevantFiles.length > 0) {
    output += `**Files:** ${finding.relevantFiles.map(f => `\`${f}\``).join(', ')}\n`;
  }

  return output;
}

/**
 * Gets an emoji indicator for a security level
 */
function getLevelEmoji(level: SecurityLevel): string {
  switch (level) {
    case 'critical':
      return '[CRITICAL]';
    case 'high':
      return '[HIGH]';
    case 'medium':
      return '[MEDIUM]';
    case 'low':
      return '[LOW]';
  }
}

/**
 * Sorts findings by severity (critical first)
 */
export function sortFindingsBySeverity(findings: SecurityFinding[]): SecurityFinding[] {
  const levelOrder: Record<SecurityLevel, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...findings].sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
}

/**
 * Groups findings by level
 */
export function groupFindingsByLevel(findings: SecurityFinding[]): Record<SecurityLevel, SecurityFinding[]> {
  return {
    critical: findings.filter(f => f.level === 'critical'),
    high: findings.filter(f => f.level === 'high'),
    medium: findings.filter(f => f.level === 'medium'),
    low: findings.filter(f => f.level === 'low'),
  };
}

/**
 * Groups findings by file
 */
export function groupFindingsByFile(findings: SecurityFinding[]): Map<string, SecurityFinding[]> {
  const byFile = new Map<string, SecurityFinding[]>();

  for (const finding of findings) {
    if (finding.relevantFiles) {
      for (const file of finding.relevantFiles) {
        const existing = byFile.get(file) || [];
        existing.push(finding);
        byFile.set(file, existing);
      }
    }
  }

  return byFile;
}
