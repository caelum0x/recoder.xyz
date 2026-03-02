/**
 * Quality Badge Component
 * Displays AI response quality score with color-coded badge and tooltip breakdown.
 *
 * Features:
 * - Color-coded badge (green/yellow/red)
 * - Hover tooltip with detailed breakdown
 * - Click to expand full details
 * - Dimension scores visualization
 */

import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import type { QualityResult, QualityDimension } from '~/lib/services/response-quality';
import {
  getScoreColor,
  getScoreBgColor,
  getGradeColor,
} from '~/lib/services/response-quality';
import {
  qualityScores,
  qualityScoringEnabled,
  type StoredQualityScore,
} from '~/lib/stores/quality-scores';

// ============================================================================
// Types
// ============================================================================

interface QualityBadgeProps {
  /** Message ID to look up the score */
  messageId: string;
  /** Optionally pass result directly */
  result?: QualityResult;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show grade instead of score */
  showGrade?: boolean;
  /** Compact mode (just the score/grade) */
  compact?: boolean;
  /** Custom className */
  className?: string;
}

interface TooltipProps {
  result: QualityResult;
  visible: boolean;
  position: { top: number; left: number };
}

// ============================================================================
// Helper Components
// ============================================================================

const DimensionBar: React.FC<{
  label: string;
  score: number;
  icon: string;
}> = ({ label, score, icon }) => {
  const getBarColor = (s: number) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-recoder-elements-textSecondary">
          <div className={icon} />
          {label}
        </span>
        <span className={`font-mono ${getScoreColor(score)}`}>{score}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--recoder-elements-bg-depth-3)' }}>
        <div
          className={`h-full transition-all duration-300 ${getBarColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
};

const QualityTooltip: React.FC<TooltipProps> = ({ result, visible, position }) => {
  if (!visible) return null;

  // Safety check for dimensions
  const dims = result?.dimensions;

  return (
    <div
      className="fixed z-50 w-72 p-3 rounded-lg shadow-xl"
      style={{
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)',
        backgroundColor: 'var(--recoder-elements-bg-depth-2)',
        border: '1px solid var(--recoder-elements-bg-depth-3)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--recoder-elements-bg-depth-3)' }}>
        <span className="text-sm font-medium text-recoder-elements-textPrimary">
          Quality Score
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${getScoreColor(result.overallScore)}`}>
            {result.overallScore}
          </span>
          <span className={`text-sm font-bold ${getGradeColor(result.grade)}`}>
            ({result.grade})
          </span>
        </div>
      </div>

      {/* Dimension Scores */}
      {dims && (
      <div className="space-y-2 mb-3">
        <DimensionBar
          label="Completeness"
          score={dims.completeness?.score ?? 0}
          icon="i-ph:check-circle"
        />
        <DimensionBar
          label="Code Quality"
          score={dims.codeQuality?.score ?? 0}
          icon="i-ph:code"
        />
        <DimensionBar
          label="Relevance"
          score={dims.relevance?.score ?? 0}
          icon="i-ph:target"
        />
        <DimensionBar
          label="Efficiency"
          score={dims.efficiency?.score ?? 0}
          icon="i-ph:lightning"
        />
      </div>
      )}

      {/* Issues */}
      {result.issues.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-medium text-recoder-elements-textSecondary mb-1">
            Issues ({result.issues.length})
          </div>
          <div className="space-y-1">
            {result.issues.slice(0, 3).map((issue, idx) => (
              <div
                key={idx}
                className="flex items-start gap-1 text-xs text-recoder-elements-textTertiary"
              >
                <div
                  className={`mt-0.5 ${
                    issue.severity === 'high'
                      ? 'i-ph:warning-circle text-red-500'
                      : issue.severity === 'medium'
                        ? 'i-ph:warning text-yellow-500'
                        : 'i-ph:info text-blue-500'
                  }`}
                />
                <span className="line-clamp-1">{issue.message}</span>
              </div>
            ))}
            {result.issues.length > 3 && (
              <div className="text-xs text-recoder-elements-textTertiary">
                +{result.issues.length - 3} more issues
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--recoder-elements-bg-depth-3)' }}>
        <span className="text-xs text-recoder-elements-textTertiary">
          {result.metadata.codeBlockCount} code blocks
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            result.acceptable
              ? 'bg-green-500/20 text-green-500'
              : 'bg-red-500/20 text-red-500'
          }`}
        >
          {result.acceptable ? 'Acceptable' : 'Needs Improvement'}
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const QualityBadge: React.FC<QualityBadgeProps> = ({
  messageId,
  result: providedResult,
  size = 'sm',
  showGrade = false,
  compact = false,
  className = '',
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const badgeRef = useRef<HTMLButtonElement>(null);

  const scoringEnabled = useStore(qualityScoringEnabled);
  const scores = useStore(qualityScores);

  // Get result from store or use provided
  const storedScore = scores[messageId];
  const result = providedResult || storedScore?.result;

  // Hide if scoring disabled or no result
  if (!scoringEnabled || !result) {
    return null;
  }

  // Calculate tooltip position
  const updateTooltipPosition = () => {
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    }
  };

  // Size classes
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  // Score display
  const displayValue = showGrade ? result.grade : result.overallScore;

  return (
    <>
      <button
        ref={badgeRef}
        className={`
          inline-flex items-center gap-1 rounded-md border transition-all
          ${sizeClasses[size]}
          ${getScoreBgColor(result.overallScore)}
          hover:opacity-80 cursor-pointer
          ${className}
        `}
        onMouseEnter={() => {
          updateTooltipPosition();
          setShowTooltip(true);
        }}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => {
          updateTooltipPosition();
          setShowTooltip(!showTooltip);
        }}
        title={`Quality: ${result.overallScore}/100 (${result.grade})`}
      >
        {!compact && (
          <div
            className={`
              ${
                result.overallScore >= 80
                  ? 'i-ph:check-circle text-green-500'
                  : result.overallScore >= 60
                    ? 'i-ph:warning text-yellow-500'
                    : 'i-ph:x-circle text-red-500'
              }
            `}
          />
        )}
        <span className={`font-mono font-medium ${getScoreColor(result.overallScore)}`}>
          {displayValue}
        </span>
      </button>

      <QualityTooltip
        result={result}
        visible={showTooltip}
        position={tooltipPosition}
      />
    </>
  );
};

// ============================================================================
// Variant Components
// ============================================================================

/**
 * Inline quality indicator (very compact)
 */
export const QualityIndicator: React.FC<{
  messageId: string;
  result?: QualityResult;
}> = ({ messageId, result: providedResult }) => {
  const scores = useStore(qualityScores);
  const scoringEnabled = useStore(qualityScoringEnabled);

  const storedScore = scores[messageId];
  const result = providedResult || storedScore?.result;

  if (!scoringEnabled || !result) {
    return null;
  }

  const getIndicatorColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div
      className={`w-2 h-2 rounded-full ${getIndicatorColor(result.overallScore)}`}
      title={`Quality: ${result.overallScore}/100`}
    />
  );
};

/**
 * Quality summary for multiple messages
 */
export const QualitySummary: React.FC<{
  messageIds: string[];
  className?: string;
}> = ({ messageIds, className = '' }) => {
  const scores = useStore(qualityScores);

  const relevantScores = messageIds
    .map(id => scores[id])
    .filter((s): s is StoredQualityScore => s !== undefined);

  if (relevantScores.length === 0) {
    return null;
  }

  const averageScore = Math.round(
    relevantScores.reduce((sum, s) => sum + s.result.overallScore, 0) / relevantScores.length
  );

  const lowQualityCount = relevantScores.filter(s => s.result.overallScore < 60).length;

  return (
    <div
      className={`
        flex items-center gap-2 text-xs text-recoder-elements-textSecondary
        ${className}
      `}
    >
      <div className="i-ph:chart-bar" />
      <span>
        Avg Quality: <span className={getScoreColor(averageScore)}>{averageScore}</span>
      </span>
      {lowQualityCount > 0 && (
        <span className="text-red-500">
          ({lowQualityCount} low quality)
        </span>
      )}
    </div>
  );
};

/**
 * Quality trend indicator
 */
export const QualityTrendBadge: React.FC<{
  trend: 'improving' | 'stable' | 'declining';
  change: number;
  className?: string;
}> = ({ trend, change, className = '' }) => {
  const trendConfig = {
    improving: {
      icon: 'i-ph:trend-up',
      color: 'text-green-500',
      bg: 'bg-green-500/20',
      label: 'Improving',
    },
    stable: {
      icon: 'i-ph:minus',
      color: 'text-blue-500',
      bg: 'bg-blue-500/20',
      label: 'Stable',
    },
    declining: {
      icon: 'i-ph:trend-down',
      color: 'text-red-500',
      bg: 'bg-red-500/20',
      label: 'Declining',
    },
  };

  const config = trendConfig[trend];

  return (
    <div
      className={`
        inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs
        ${config.bg} ${config.color}
        ${className}
      `}
    >
      <div className={config.icon} />
      <span>{config.label}</span>
      {change !== 0 && (
        <span className="font-mono">
          ({change > 0 ? '+' : ''}{change})
        </span>
      )}
    </div>
  );
};

// ============================================================================
// Export
// ============================================================================

export default QualityBadge;
