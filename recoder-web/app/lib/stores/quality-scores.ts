/**
 * Quality Scores Store
 * Tracks AI response quality scores over time using nanostores.
 *
 * Features:
 * - Store individual response quality scores
 * - Track scores over time for session analysis
 * - Calculate average quality per session
 * - Persist scores to localStorage for continuity
 */

import { atom, computed, map } from 'nanostores';
import type { QualityResult, QualityDimension } from '../services/response-quality';

// ============================================================================
// Types
// ============================================================================

export interface StoredQualityScore {
  /** Unique ID for the message */
  messageId: string;
  /** The quality evaluation result */
  result: QualityResult;
  /** Associated chat/session ID */
  chatId?: string;
  /** User query that generated the response (for context) */
  userQuery?: string;
  /** Model used for the response */
  model?: string;
  /** Timestamp when score was recorded */
  recordedAt: number;
}

export interface SessionStats {
  /** Total number of scored responses */
  totalResponses: number;
  /** Average overall score */
  averageScore: number;
  /** Average score per dimension */
  dimensionAverages: Record<QualityDimension, number>;
  /** Grade distribution */
  gradeDistribution: Record<string, number>;
  /** Issue frequency */
  issueFrequency: Record<string, number>;
  /** Session start time */
  sessionStart: number;
  /** Last update time */
  lastUpdated: number;
}

export interface QualityTrend {
  /** Rolling average (last N responses) */
  rollingAverage: number;
  /** Trend direction */
  trend: 'improving' | 'stable' | 'declining';
  /** Change from previous average */
  change: number;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'recoder-quality-scores';
const MAX_STORED_SCORES = 100; // Keep last 100 scores
const ROLLING_WINDOW = 10; // For trend calculation

// ============================================================================
// Stores
// ============================================================================

/**
 * Map of message IDs to quality scores
 */
export const qualityScores = map<Record<string, StoredQualityScore>>({});

/**
 * Current session ID
 */
export const currentSessionId = atom<string | null>(null);

/**
 * Whether quality scoring is enabled
 */
export const qualityScoringEnabled = atom<boolean>(true);

/**
 * Loading state for quality evaluation
 */
export const isEvaluating = atom<boolean>(false);

// ============================================================================
// Computed Values
// ============================================================================

/**
 * All scores as an array, sorted by timestamp (newest first)
 */
export const scoresArray = computed(qualityScores, (scores) => {
  return Object.values(scores).sort((a, b) => b.recordedAt - a.recordedAt);
});

/**
 * Scores for the current session
 */
export const sessionScores = computed(
  [qualityScores, currentSessionId],
  (scores, sessionId) => {
    if (!sessionId) return [];
    return Object.values(scores)
      .filter(s => s.chatId === sessionId)
      .sort((a, b) => b.recordedAt - a.recordedAt);
  }
);

/**
 * Session statistics
 */
export const sessionStats = computed(sessionScores, (scores): SessionStats | null => {
  if (scores.length === 0) return null;

  const dimensionTotals: Record<QualityDimension, number> = {
    completeness: 0,
    codeQuality: 0,
    relevance: 0,
    efficiency: 0,
  };

  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const issueFrequency: Record<string, number> = {};
  let totalScore = 0;

  for (const score of scores) {
    totalScore += score.result.overallScore;

    // Dimension totals - with null checks
    const dims = score.result?.dimensions;
    if (dims) {
      dimensionTotals.completeness += dims.completeness?.score ?? 0;
      dimensionTotals.codeQuality += dims.codeQuality?.score ?? 0;
      dimensionTotals.relevance += dims.relevance?.score ?? 0;
      dimensionTotals.efficiency += dims.efficiency?.score ?? 0;
    }

    // Grade distribution
    gradeDistribution[score.result.grade] = (gradeDistribution[score.result.grade] || 0) + 1;

    // Issue frequency
    for (const issue of score.result.issues) {
      issueFrequency[issue.type] = (issueFrequency[issue.type] || 0) + 1;
    }
  }

  const count = scores.length;
  const timestamps = scores.map(s => s.recordedAt);

  return {
    totalResponses: count,
    averageScore: Math.round(totalScore / count),
    dimensionAverages: {
      completeness: Math.round(dimensionTotals.completeness / count),
      codeQuality: Math.round(dimensionTotals.codeQuality / count),
      relevance: Math.round(dimensionTotals.relevance / count),
      efficiency: Math.round(dimensionTotals.efficiency / count),
    },
    gradeDistribution,
    issueFrequency,
    sessionStart: Math.min(...timestamps),
    lastUpdated: Math.max(...timestamps),
  };
});

/**
 * Quality trend based on recent scores
 */
export const qualityTrend = computed(sessionScores, (scores): QualityTrend | null => {
  if (scores.length < 3) return null;

  const recent = scores.slice(0, ROLLING_WINDOW);
  const rollingAverage = Math.round(
    recent.reduce((sum, s) => sum + s.result.overallScore, 0) / recent.length
  );

  // Compare to previous period
  const older = scores.slice(ROLLING_WINDOW, ROLLING_WINDOW * 2);
  if (older.length === 0) {
    return { rollingAverage, trend: 'stable', change: 0 };
  }

  const previousAverage = Math.round(
    older.reduce((sum, s) => sum + s.result.overallScore, 0) / older.length
  );

  const change = rollingAverage - previousAverage;
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (change >= 5) trend = 'improving';
  else if (change <= -5) trend = 'declining';

  return { rollingAverage, trend, change };
});

/**
 * Average score for the current session
 */
export const averageSessionScore = computed(sessionScores, (scores) => {
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, s) => sum + s.result.overallScore, 0) / scores.length);
});

/**
 * Count of low quality responses in session
 */
export const lowQualityCount = computed(sessionScores, (scores) => {
  return scores.filter(s => s.result.overallScore < 60).length;
});

// ============================================================================
// Actions
// ============================================================================

/**
 * Add a quality score for a message
 */
export function addQualityScore(
  messageId: string,
  result: QualityResult,
  options?: {
    chatId?: string;
    userQuery?: string;
    model?: string;
  }
): void {
  const storedScore: StoredQualityScore = {
    messageId,
    result,
    chatId: options?.chatId || currentSessionId.get() || undefined,
    userQuery: options?.userQuery,
    model: options?.model,
    recordedAt: Date.now(),
  };

  qualityScores.setKey(messageId, storedScore);

  // Persist to localStorage (with pruning)
  persistScores();
}

/**
 * Get quality score for a specific message
 */
export function getQualityScore(messageId: string): StoredQualityScore | undefined {
  return qualityScores.get()[messageId];
}

/**
 * Remove quality score for a message
 */
export function removeQualityScore(messageId: string): void {
  const current = qualityScores.get();
  if (current[messageId]) {
    const { [messageId]: _, ...rest } = current;
    qualityScores.set(rest);
    persistScores();
  }
}

/**
 * Clear all scores for a session
 */
export function clearSessionScores(sessionId: string): void {
  const current = qualityScores.get();
  const filtered = Object.fromEntries(
    Object.entries(current).filter(([_, score]) => score.chatId !== sessionId)
  );
  qualityScores.set(filtered);
  persistScores();
}

/**
 * Clear all quality scores
 */
export function clearAllScores(): void {
  qualityScores.set({});
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Set current session ID
 */
export function setCurrentSession(sessionId: string | null): void {
  currentSessionId.set(sessionId);
}

/**
 * Toggle quality scoring
 */
export function toggleQualityScoring(enabled?: boolean): void {
  qualityScoringEnabled.set(enabled ?? !qualityScoringEnabled.get());
}

/**
 * Set evaluation loading state
 */
export function setEvaluating(loading: boolean): void {
  isEvaluating.set(loading);
}

// ============================================================================
// Persistence
// ============================================================================

/**
 * Load scores from localStorage
 */
export function loadScores(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed !== null) {
        qualityScores.set(parsed);
      }
    }
  } catch (error) {
    console.warn('[QualityScores] Failed to load scores from localStorage:', error);
  }
}

/**
 * Persist scores to localStorage (with pruning)
 */
function persistScores(): void {
  try {
    const current = qualityScores.get();
    const entries = Object.entries(current);

    // Prune if over limit
    if (entries.length > MAX_STORED_SCORES) {
      // Sort by timestamp and keep newest
      const sorted = entries.sort((a, b) => b[1].recordedAt - a[1].recordedAt);
      const pruned = Object.fromEntries(sorted.slice(0, MAX_STORED_SCORES));
      qualityScores.set(pruned);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    }
  } catch (error) {
    console.warn('[QualityScores] Failed to persist scores:', error);
  }
}

// ============================================================================
// Analytics
// ============================================================================

/**
 * Get scores for a specific time range
 */
export function getScoresInRange(startTime: number, endTime: number): StoredQualityScore[] {
  const scores = qualityScores.get();
  return Object.values(scores)
    .filter(s => s.recordedAt >= startTime && s.recordedAt <= endTime)
    .sort((a, b) => a.recordedAt - b.recordedAt);
}

/**
 * Get score distribution for a session or all scores
 */
export function getScoreDistribution(sessionId?: string): Record<string, number> {
  const scores = sessionId
    ? Object.values(qualityScores.get()).filter(s => s.chatId === sessionId)
    : Object.values(qualityScores.get());

  const distribution: Record<string, number> = {
    '90-100': 0,
    '80-89': 0,
    '70-79': 0,
    '60-69': 0,
    '0-59': 0,
  };

  for (const score of scores) {
    const s = score.result.overallScore;
    if (s >= 90) distribution['90-100']++;
    else if (s >= 80) distribution['80-89']++;
    else if (s >= 70) distribution['70-79']++;
    else if (s >= 60) distribution['60-69']++;
    else distribution['0-59']++;
  }

  return distribution;
}

/**
 * Get most common issues across all scores
 */
export function getMostCommonIssues(limit: number = 5): Array<{ type: string; count: number }> {
  const scores = qualityScores.get();
  const issueCount: Record<string, number> = {};

  for (const score of Object.values(scores)) {
    for (const issue of score.result.issues) {
      issueCount[issue.type] = (issueCount[issue.type] || 0) + 1;
    }
  }

  return Object.entries(issueCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([type, count]) => ({ type, count }));
}

/**
 * Get quality improvement suggestions based on common issues
 */
export function getImprovementSuggestions(sessionId?: string): string[] {
  const scores = sessionId
    ? Object.values(qualityScores.get()).filter(s => s.chatId === sessionId)
    : Object.values(qualityScores.get());

  const allSuggestions: string[] = [];
  const suggestionCount: Record<string, number> = {};

  for (const score of scores) {
    for (const suggestion of score.result.suggestions) {
      suggestionCount[suggestion] = (suggestionCount[suggestion] || 0) + 1;
      allSuggestions.push(suggestion);
    }
  }

  // Return most common suggestions
  return [...new Set(allSuggestions)]
    .sort((a, b) => (suggestionCount[b] || 0) - (suggestionCount[a] || 0))
    .slice(0, 5);
}

/**
 * Export session statistics for reporting
 */
export function exportSessionReport(sessionId: string): string {
  const scores = Object.values(qualityScores.get()).filter(s => s.chatId === sessionId);
  if (scores.length === 0) return 'No scores found for this session.';

  const stats = sessionStats.get();
  if (!stats) return 'No statistics available.';

  const lines: string[] = [
    '# Quality Report',
    `Generated: ${new Date().toISOString()}`,
    `Session: ${sessionId}`,
    '',
    '## Summary',
    `- Total Responses: ${stats.totalResponses}`,
    `- Average Score: ${stats.averageScore}/100`,
    '',
    '## Dimension Averages',
    `- Completeness: ${stats.dimensionAverages.completeness}/100`,
    `- Code Quality: ${stats.dimensionAverages.codeQuality}/100`,
    `- Relevance: ${stats.dimensionAverages.relevance}/100`,
    `- Efficiency: ${stats.dimensionAverages.efficiency}/100`,
    '',
    '## Grade Distribution',
    ...Object.entries(stats.gradeDistribution).map(([grade, count]) => `- ${grade}: ${count}`),
    '',
    '## Common Issues',
    ...Object.entries(stats.issueFrequency)
      .sort((a, b) => b[1] - a[1])
      .map(([issue, count]) => `- ${issue}: ${count}`),
  ];

  return lines.join('\n');
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize quality scores store
 */
export function initializeQualityScores(): void {
  loadScores();
}

// Auto-initialize on import (client-side only)
if (typeof window !== 'undefined') {
  // Defer initialization to avoid SSR issues
  setTimeout(initializeQualityScores, 0);
}
