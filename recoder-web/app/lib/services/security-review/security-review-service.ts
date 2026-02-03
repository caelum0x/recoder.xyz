/**
 * Security Review Service
 *
 * Main service for conducting security reviews on code files.
 * Combines static analysis with AI-powered vulnerability detection.
 */

import type {
  SecurityReviewResult,
  SecurityReviewRequest,
  SecurityFinding,
  FileContent,
  SecurityReviewOptions,
  SecuritySummary,
} from './types';
import { createSecuritySummary } from './types';
import { SECURITY_REVIEW_SYSTEM_PROMPT, SECURITY_REVIEW_USER_PROMPT, generateFocusedSecurityPrompt } from './prompts';
import { parseSecurityFindings, toSecurityFinding, sortFindingsBySeverity } from './parser';
import { analyzeFilesForSecurity, calculateSecurityScore } from './analyzer';

// Storage for security review history
const reviewHistory = new Map<string, SecurityReviewResult[]>();

// Maximum reviews to keep per project
const MAX_HISTORY_PER_PROJECT = 10;

/**
 * Main entry point for security review
 */
export async function performSecurityReview(
  request: SecurityReviewRequest,
  aiReviewFn?: (systemPrompt: string, userPrompt: string) => Promise<string>
): Promise<SecurityReviewResult> {
  const { projectId, files, options } = request;
  const timestamp = new Date().toISOString();

  // Filter files based on options
  const filesToAnalyze = filterFiles(files, options);

  // Perform static analysis first (instant results)
  const staticFindings = analyzeFilesForSecurity(filesToAnalyze);

  // Perform AI analysis if function provided
  let aiFindings: SecurityFinding[] = [];
  if (aiReviewFn) {
    try {
      aiFindings = await performAISecurityReview(filesToAnalyze, options, aiReviewFn);
    } catch (error) {
      console.error('AI security review failed:', error);
      // Continue with static findings only
    }
  }

  // Merge and deduplicate findings
  const allFindings = mergeFindings(staticFindings, aiFindings);

  // Apply max findings limit if specified
  const limitedFindings = options?.maxFindings
    ? allFindings.slice(0, options.maxFindings)
    : allFindings;

  // Create the result
  const result: SecurityReviewResult = {
    findings: sortFindingsBySeverity(limitedFindings),
    timestamp,
    projectId,
    filesAnalyzed: filesToAnalyze.map(f => f.path),
    summary: createSecuritySummary(limitedFindings),
  };

  // Store in history
  storeReviewResult(projectId, result);

  return result;
}

/**
 * Performs AI-powered security review
 */
async function performAISecurityReview(
  files: FileContent[],
  options: SecurityReviewOptions | undefined,
  aiReviewFn: (systemPrompt: string, userPrompt: string) => Promise<string>
): Promise<SecurityFinding[]> {
  // Build the prompt
  let systemPrompt = SECURITY_REVIEW_SYSTEM_PROMPT;

  // Add focus areas if specified
  if (options?.focusAreas && options.focusAreas.length > 0) {
    systemPrompt += '\n\n' + generateFocusedSecurityPrompt(options.focusAreas);
  }

  // Build user prompt with file contents
  const filesContent = files
    .map(f => `### File: ${f.path}\n\`\`\`\n${truncateContent(f.content, 10000)}\n\`\`\``)
    .join('\n\n');

  const userPrompt = SECURITY_REVIEW_USER_PROMPT.replace('{FILES_CONTENT}', filesContent);

  // Call AI
  const response = await aiReviewFn(systemPrompt, userPrompt);

  // Parse findings from response
  const parsedFindings = parseSecurityFindings(response);

  return parsedFindings.map(toSecurityFinding);
}

/**
 * Filters files based on options
 */
function filterFiles(files: FileContent[], options?: SecurityReviewOptions): FileContent[] {
  if (!options?.skipFiles || options.skipFiles.length === 0) {
    return files;
  }

  return files.filter(file => {
    return !options.skipFiles!.some(skip => {
      // Support glob-like patterns
      if (skip.includes('*')) {
        const regex = new RegExp('^' + skip.replace(/\*/g, '.*') + '$');
        return regex.test(file.path);
      }
      return file.path.includes(skip);
    });
  });
}

/**
 * Merges findings from multiple sources, deduplicating similar findings
 */
function mergeFindings(staticFindings: SecurityFinding[], aiFindings: SecurityFinding[]): SecurityFinding[] {
  const merged: SecurityFinding[] = [...staticFindings];

  for (const aiFinding of aiFindings) {
    // Check for duplicate
    const isDuplicate = merged.some(existing => {
      // Same title and overlapping files
      if (existing.title.toLowerCase() === aiFinding.title.toLowerCase()) {
        return true;
      }

      // Similar description and same severity
      if (
        existing.level === aiFinding.level &&
        existing.relevantFiles?.some(f => aiFinding.relevantFiles?.includes(f))
      ) {
        // Check for similar description (simplified similarity check)
        const existingWords = new Set(existing.description.toLowerCase().split(/\s+/));
        const aiWords = aiFinding.description.toLowerCase().split(/\s+/);
        const overlap = aiWords.filter(w => existingWords.has(w)).length;
        if (overlap / aiWords.length > 0.5) {
          return true;
        }
      }

      return false;
    });

    if (!isDuplicate) {
      merged.push(aiFinding);
    }
  }

  return merged;
}

/**
 * Truncates content to a maximum length
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + '\n... (content truncated)';
}

/**
 * Stores a review result in history
 */
function storeReviewResult(projectId: string, result: SecurityReviewResult): void {
  const history = reviewHistory.get(projectId) || [];
  history.unshift(result);

  // Limit history size
  if (history.length > MAX_HISTORY_PER_PROJECT) {
    history.pop();
  }

  reviewHistory.set(projectId, history);
}

/**
 * Gets the latest security review for a project
 */
export function getLatestSecurityReview(projectId: string): SecurityReviewResult | null {
  const history = reviewHistory.get(projectId);
  return history?.[0] || null;
}

/**
 * Gets all security reviews for a project
 */
export function getSecurityReviewHistory(projectId: string): SecurityReviewResult[] {
  return reviewHistory.get(projectId) || [];
}

/**
 * Clears security review history for a project
 */
export function clearSecurityReviewHistory(projectId: string): void {
  reviewHistory.delete(projectId);
}

/**
 * Gets a summary of all security findings across all projects
 */
export function getGlobalSecuritySummary(): {
  totalProjects: number;
  totalFindings: number;
  byLevel: Record<string, number>;
  recentReviews: { projectId: string; timestamp: string; findingsCount: number }[];
} {
  let totalFindings = 0;
  const byLevel = { critical: 0, high: 0, medium: 0, low: 0 };
  const recentReviews: { projectId: string; timestamp: string; findingsCount: number }[] = [];

  for (const [projectId, history] of Array.from(reviewHistory.entries())) {
    if (history.length > 0) {
      const latest = history[0];
      totalFindings += latest.findings.length;

      latest.findings.forEach(f => {
        byLevel[f.level]++;
      });

      recentReviews.push({
        projectId,
        timestamp: latest.timestamp,
        findingsCount: latest.findings.length,
      });
    }
  }

  // Sort recent reviews by timestamp
  recentReviews.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    totalProjects: reviewHistory.size,
    totalFindings,
    byLevel,
    recentReviews: recentReviews.slice(0, 10),
  };
}

/**
 * Quick security scan for immediate feedback
 */
export function quickSecurityScan(files: FileContent[]): {
  findings: SecurityFinding[];
  score: number;
  summary: SecuritySummary;
} {
  const findings = sortFindingsBySeverity(analyzeFilesForSecurity(files));
  const score = calculateSecurityScore(findings);
  const summary = createSecuritySummary(findings);

  return { findings, score, summary };
}

/**
 * Checks if a project needs a security review
 */
export function needsSecurityReview(projectId: string, maxAgeHours = 24): boolean {
  const latest = getLatestSecurityReview(projectId);
  if (!latest) {
    return true;
  }

  const lastReviewTime = new Date(latest.timestamp).getTime();
  const maxAge = maxAgeHours * 60 * 60 * 1000;

  return Date.now() - lastReviewTime > maxAge;
}
