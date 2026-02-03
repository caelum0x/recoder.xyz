/**
 * Security Review React Hook
 *
 * Provides a React hook for performing and managing security reviews.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  SecurityReviewResult,
  SecurityFinding,
  FileContent,
  SecurityReviewOptions,
  SecuritySummary,
} from './types';
import {
  performSecurityReview,
  getLatestSecurityReview,
  quickSecurityScan,
  needsSecurityReview,
} from './security-review-service';
import { createSecuritySummary } from './types';

export interface UseSecurityReviewOptions {
  projectId: string;
  autoReview?: boolean;
  autoReviewIntervalMs?: number;
  onFindingsChange?: (findings: SecurityFinding[]) => void;
}

export interface UseSecurityReviewReturn {
  // State
  isLoading: boolean;
  isScanning: boolean;
  error: string | null;
  result: SecurityReviewResult | null;
  findings: SecurityFinding[];
  summary: SecuritySummary | null;
  lastReviewTimestamp: string | null;

  // Actions
  runReview: (files: FileContent[], options?: SecurityReviewOptions) => Promise<SecurityReviewResult>;
  runQuickScan: (files: FileContent[]) => { findings: SecurityFinding[]; score: number; summary: SecuritySummary };
  clearError: () => void;
  refresh: () => void;
}

/**
 * Hook for performing security reviews
 */
export function useSecurityReview({
  projectId,
  autoReview = false,
  autoReviewIntervalMs = 30 * 60 * 1000, // 30 minutes
  onFindingsChange,
}: UseSecurityReviewOptions): UseSecurityReviewReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SecurityReviewResult | null>(() => getLatestSecurityReview(projectId));

  const onFindingsChangeRef = useRef(onFindingsChange);
  onFindingsChangeRef.current = onFindingsChange;

  // Auto-review effect
  useEffect(() => {
    if (!autoReview) return;

    const checkAndReview = () => {
      if (needsSecurityReview(projectId)) {
        // Trigger review notification - actual files would need to be provided
        console.log(`Project ${projectId} needs security review`);
      }
    };

    checkAndReview();
    const interval = setInterval(checkAndReview, autoReviewIntervalMs);

    return () => clearInterval(interval);
  }, [projectId, autoReview, autoReviewIntervalMs]);

  // Notify on findings change
  useEffect(() => {
    if (result?.findings && onFindingsChangeRef.current) {
      onFindingsChangeRef.current(result.findings);
    }
  }, [result?.findings]);

  const runReview = useCallback(
    async (files: FileContent[], options?: SecurityReviewOptions): Promise<SecurityReviewResult> => {
      setIsLoading(true);
      setError(null);

      try {
        const reviewResult = await performSecurityReview({
          projectId,
          files,
          options,
        });

        setResult(reviewResult);
        return reviewResult;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Security review failed';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [projectId]
  );

  const runQuickScan = useCallback((files: FileContent[]) => {
    setIsScanning(true);
    try {
      return quickSecurityScan(files);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refresh = useCallback(() => {
    const latest = getLatestSecurityReview(projectId);
    setResult(latest);
  }, [projectId]);

  return {
    isLoading,
    isScanning,
    error,
    result,
    findings: result?.findings || [],
    summary: result ? createSecuritySummary(result.findings) : null,
    lastReviewTimestamp: result?.timestamp || null,
    runReview,
    runQuickScan,
    clearError,
    refresh,
  };
}

/**
 * Hook for displaying security findings in a component
 */
export function useSecurityFindings(findings: SecurityFinding[]) {
  const criticalFindings = findings.filter(f => f.level === 'critical');
  const highFindings = findings.filter(f => f.level === 'high');
  const mediumFindings = findings.filter(f => f.level === 'medium');
  const lowFindings = findings.filter(f => f.level === 'low');

  const hasCritical = criticalFindings.length > 0;
  const hasHigh = highFindings.length > 0;
  const hasMedium = mediumFindings.length > 0;
  const hasLow = lowFindings.length > 0;

  const overallStatus = hasCritical
    ? 'critical'
    : hasHigh
    ? 'high'
    : hasMedium
    ? 'medium'
    : hasLow
    ? 'low'
    : 'secure';

  const statusColor = {
    critical: 'red',
    high: 'orange',
    medium: 'yellow',
    low: 'blue',
    secure: 'green',
  }[overallStatus];

  const statusMessage = {
    critical: 'Critical security issues found',
    high: 'High severity issues found',
    medium: 'Medium severity issues found',
    low: 'Low severity issues found',
    secure: 'No security issues found',
  }[overallStatus];

  return {
    criticalFindings,
    highFindings,
    mediumFindings,
    lowFindings,
    hasCritical,
    hasHigh,
    hasMedium,
    hasLow,
    overallStatus,
    statusColor,
    statusMessage,
    totalCount: findings.length,
  };
}

/**
 * Hook for security review with AI integration
 */
export function useSecurityReviewWithAI(options: UseSecurityReviewOptions & {
  aiReviewFn?: (systemPrompt: string, userPrompt: string) => Promise<string>;
}): UseSecurityReviewReturn {
  const baseHook = useSecurityReview(options);

  const runReviewWithAI = useCallback(
    async (files: FileContent[], reviewOptions?: SecurityReviewOptions): Promise<SecurityReviewResult> => {
      const result = await performSecurityReview(
        {
          projectId: options.projectId,
          files,
          options: reviewOptions,
        },
        options.aiReviewFn
      );

      return result;
    },
    [options.projectId, options.aiReviewFn]
  );

  return {
    ...baseHook,
    runReview: options.aiReviewFn ? runReviewWithAI : baseHook.runReview,
  };
}
