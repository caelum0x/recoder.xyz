import { backendApi } from '@/lib/api-client';

export interface SentimentScore {
  id: string | null;
  thread_id: string;
  message_index: number;
  sentiment: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';
  confidence: number;
  keywords: string[];
  scored_at: string | null;
}

export interface SentimentTrendPoint {
  message_index: number;
  sentiment: string;
  value: number; // -2 to +2
}

export interface SentimentOverview {
  distribution: Record<string, number>;
  most_positive_threads: Array<{
    thread_id: string;
    avg_sentiment: number;
    message_count: number;
  }>;
  most_negative_threads: Array<{
    thread_id: string;
    avg_sentiment: number;
    message_count: number;
  }>;
  per_agent_avg: Array<{
    agent_id: string;
    avg_sentiment: number;
    message_count: number;
  }>;
}

export interface AnalyzeResult {
  thread_id: string;
  scores_count: number;
  scores: Array<{
    message_index: number;
    sentiment: string;
    confidence: number;
    keywords: string[];
  }>;
}

export const analyzeSentiment = async (threadId: string): Promise<AnalyzeResult> => {
  const response = await backendApi.post<AnalyzeResult>(
    `/threads/${threadId}/sentiment/analyze`,
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to analyze sentiment: ${response.error.message}`);
  }

  return response.data!;
};

export const getThreadSentiment = async (threadId: string): Promise<SentimentScore[]> => {
  const response = await backendApi.get<SentimentScore[]>(
    `/threads/${threadId}/sentiment`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to get thread sentiment: ${response.error.message}`);
  }

  return response.data!;
};

export const getSentimentTrend = async (threadId: string): Promise<SentimentTrendPoint[]> => {
  const response = await backendApi.get<SentimentTrendPoint[]>(
    `/threads/${threadId}/sentiment/trend`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to get sentiment trend: ${response.error.message}`);
  }

  return response.data!;
};

export const getSentimentOverview = async (): Promise<SentimentOverview> => {
  const response = await backendApi.get<SentimentOverview>(
    '/sentiment/overview',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to get sentiment overview: ${response.error.message}`);
  }

  return response.data!;
};
