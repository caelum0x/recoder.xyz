'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain } from 'lucide-react';
import {
  useThreadSentiment,
  useAnalyzeSentiment,
} from '@/hooks/threads/use-thread-sentiment';

const SENTIMENT_EMOJI: Record<string, string> = {
  very_positive: '\u{1F60A}', // smiling face with smiling eyes
  positive: '\u{1F642}',      // slightly smiling face
  neutral: '\u{1F610}',       // neutral face
  negative: '\u{1F61F}',      // worried face
  very_negative: '\u{1F620}', // angry face
};

const SENTIMENT_COLORS: Record<string, string> = {
  very_positive: 'bg-green-500/15 text-green-600 border-green-500/30',
  positive: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  neutral: 'bg-gray-500/15 text-gray-600 border-gray-500/30',
  negative: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  very_negative: 'bg-red-500/15 text-red-600 border-red-500/30',
};

interface SentimentEmojiProps {
  threadId: string;
  messageIndex: number;
}

/**
 * Small emoji indicator for individual message sentiment.
 */
export function SentimentEmoji({ threadId, messageIndex }: SentimentEmojiProps) {
  const { data: scores } = useThreadSentiment(threadId);

  if (!scores || scores.length === 0) return null;

  const score = scores.find((s) => s.message_index === messageIndex);
  if (!score) return null;

  const emoji = SENTIMENT_EMOJI[score.sentiment] || SENTIMENT_EMOJI.neutral;

  return (
    <span
      className="text-sm cursor-default"
      title={`${score.sentiment} (${Math.round(score.confidence * 100)}%)`}
    >
      {emoji}
    </span>
  );
}

interface SentimentSummaryBadgeProps {
  threadId: string;
}

/**
 * Thread-level summary badge showing overall sentiment.
 */
export function SentimentSummaryBadge({ threadId }: SentimentSummaryBadgeProps) {
  const { data: scores } = useThreadSentiment(threadId);

  if (!scores || scores.length === 0) return null;

  const sentimentValues: Record<string, number> = {
    very_positive: 2,
    positive: 1,
    neutral: 0,
    negative: -1,
    very_negative: -2,
  };

  const avg =
    scores.reduce((sum, s) => sum + (sentimentValues[s.sentiment] ?? 0), 0) /
    scores.length;

  let overallSentiment: string;
  if (avg >= 1.5) overallSentiment = 'very_positive';
  else if (avg >= 0.5) overallSentiment = 'positive';
  else if (avg > -0.5) overallSentiment = 'neutral';
  else if (avg > -1.5) overallSentiment = 'negative';
  else overallSentiment = 'very_negative';

  const emoji = SENTIMENT_EMOJI[overallSentiment];
  const colorClass = SENTIMENT_COLORS[overallSentiment];

  return (
    <Badge className={colorClass} variant="outline">
      {emoji} {overallSentiment.replace('_', ' ')}
    </Badge>
  );
}

interface AnalyzeSentimentButtonProps {
  threadId: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Button that triggers sentiment analysis for a thread.
 */
export function AnalyzeSentimentButton({
  threadId,
  variant = 'outline',
  size = 'sm',
}: AnalyzeSentimentButtonProps) {
  const analyze = useAnalyzeSentiment();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => analyze.mutate(threadId)}
      disabled={analyze.isPending}
    >
      <Brain className="h-4 w-4 mr-1" />
      {analyze.isPending ? 'Analyzing...' : 'Analyze Sentiment'}
    </Button>
  );
}
