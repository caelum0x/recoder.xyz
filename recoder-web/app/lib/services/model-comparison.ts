/**
 * Model Comparison Service
 *
 * Inspired by vscode-ai-toolkit's multi-model testing capabilities.
 * Allows running the same prompt against multiple AI models simultaneously
 * and comparing their responses, metrics, and costs.
 */

import {
  type ProviderType,
  type ModelInfo,
  MODEL_CATALOG,
  PROVIDER_CONFIGS,
} from '~/lib/.server/llm/provider-registry';

// ============================================================================
// Types
// ============================================================================

export interface ComparisonMetrics {
  /** Time to first token in milliseconds */
  timeToFirstToken: number;
  /** Total response time in milliseconds */
  totalTime: number;
  /** Estimated input token count */
  inputTokens: number;
  /** Estimated output token count */
  outputTokens: number;
  /** Total tokens used */
  totalTokens: number;
  /** Response length in characters */
  responseLength: number;
  /** Words in response */
  wordCount: number;
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Tokens per second */
  tokensPerSecond: number;
}

export interface QualityScore {
  /** Overall quality score 0-100 */
  overall: number;
  /** Response relevance to prompt 0-100 */
  relevance: number;
  /** Code quality if applicable 0-100 */
  codeQuality: number | null;
  /** Completeness of response 0-100 */
  completeness: number;
  /** Clarity and readability 0-100 */
  clarity: number;
  /** Notes about the scoring */
  notes: string[];
}

export interface ModelResponse {
  /** Model ID */
  modelId: string;
  /** Model display name */
  modelName: string;
  /** Provider type */
  provider: ProviderType;
  /** Response content */
  content: string;
  /** Response metrics */
  metrics: ComparisonMetrics;
  /** Quality score (optional, requires evaluation) */
  qualityScore?: QualityScore;
  /** Error if request failed */
  error?: string;
  /** Status of the response */
  status: 'pending' | 'streaming' | 'completed' | 'error';
  /** Timestamp when response started */
  startedAt: number;
  /** Timestamp when response completed */
  completedAt?: number;
}

export interface ComparisonResult {
  /** Unique comparison ID */
  id: string;
  /** The prompt used for comparison */
  prompt: string;
  /** System prompt if any */
  systemPrompt?: string;
  /** Results for each model */
  responses: ModelResponse[];
  /** Timestamp when comparison started */
  startedAt: number;
  /** Timestamp when all responses completed */
  completedAt?: number;
  /** Overall status */
  status: 'running' | 'completed' | 'partial' | 'error';
  /** Winner based on different criteria */
  rankings?: {
    fastest: string;
    cheapest: string;
    bestQuality?: string;
    mostVerbose: string;
    mostConcise: string;
  };
}

export interface ComparisonOptions {
  /** Models to compare */
  modelIds: string[];
  /** Maximum response time before timeout (ms) */
  timeout?: number;
  /** Temperature for generation */
  temperature?: number;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Whether to evaluate quality (slower) */
  evaluateQuality?: boolean;
  /** System prompt to use */
  systemPrompt?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default comparison options */
export const DEFAULT_COMPARISON_OPTIONS: Partial<ComparisonOptions> = {
  timeout: 60000,
  temperature: 0.7,
  maxTokens: 4000,
  evaluateQuality: false,
};

/** Popular models for comparison */
export const POPULAR_COMPARISON_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251001',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'llama-3.3-70b-versatile',
  'deepseek-chat',
];

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Rough token estimation (4 chars per token on average)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate cost for a model based on token usage
 */
function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = MODEL_CATALOG[modelId];
  if (!model) return 0;

  const inputCost = (inputTokens / 1_000_000) * model.cost.input_per_1m;
  const outputCost = (outputTokens / 1_000_000) * model.cost.output_per_1m;
  return inputCost + outputCost;
}

// ============================================================================
// Quality Evaluation
// ============================================================================

/**
 * Basic quality evaluation heuristics
 * In a production system, this could use another LLM as a judge
 */
function evaluateQuality(prompt: string, response: string): QualityScore {
  const notes: string[] = [];
  let relevance = 70;
  let codeQuality: number | null = null;
  let completeness = 70;
  let clarity = 70;

  // Check response length relative to prompt complexity
  const promptWords = prompt.split(/\s+/).length;
  const responseWords = response.split(/\s+/).length;
  const lengthRatio = responseWords / Math.max(promptWords, 1);

  if (lengthRatio < 0.5) {
    completeness -= 20;
    notes.push('Response may be too brief');
  } else if (lengthRatio > 10) {
    clarity -= 10;
    notes.push('Response may be overly verbose');
  } else {
    completeness += 10;
  }

  // Check for code blocks if prompt seems to ask for code
  const asksForCode = /\b(code|function|implement|write|create|build)\b/i.test(prompt);
  const hasCodeBlocks = /```[\s\S]*?```/.test(response);

  if (asksForCode) {
    if (hasCodeBlocks) {
      codeQuality = 75;
      relevance += 15;
      notes.push('Contains code blocks as expected');
    } else {
      codeQuality = 30;
      relevance -= 15;
      notes.push('Missing expected code blocks');
    }
  }

  // Check for markdown formatting
  const hasMarkdown = /[#*_\-\[\]`]/.test(response);
  if (hasMarkdown) {
    clarity += 5;
  }

  // Check for explanation/reasoning
  const hasExplanation = response.length > 200 && /\b(because|therefore|this|that|the)\b/i.test(response);
  if (hasExplanation) {
    clarity += 5;
    completeness += 5;
  }

  // Check for direct address of the prompt
  const promptKeywords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const responseText = response.toLowerCase();
  const keywordsFound = promptKeywords.filter(kw => responseText.includes(kw)).length;
  const keywordCoverage = promptKeywords.length > 0 ? keywordsFound / promptKeywords.length : 0;

  relevance += Math.round(keywordCoverage * 20);

  // Calculate overall score
  const scores = [relevance, completeness, clarity];
  if (codeQuality !== null) scores.push(codeQuality);
  const overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  return {
    overall: Math.min(100, Math.max(0, overall)),
    relevance: Math.min(100, Math.max(0, relevance)),
    codeQuality,
    completeness: Math.min(100, Math.max(0, completeness)),
    clarity: Math.min(100, Math.max(0, clarity)),
    notes,
  };
}

// ============================================================================
// Model Information
// ============================================================================

/**
 * Get available models for comparison
 */
export function getAvailableModels(): ModelInfo[] {
  return Object.values(MODEL_CATALOG).filter(m => !m.deprecated);
}

/**
 * Get models grouped by provider
 */
export function getModelsByProvider(): Record<ProviderType, ModelInfo[]> {
  const result: Record<ProviderType, ModelInfo[]> = {
    openai: [],
    anthropic: [],
    google: [],
    groq: [],
    deepseek: [],
    ollama: [],
    openrouter: [],
  };

  for (const model of Object.values(MODEL_CATALOG)) {
    if (!model.deprecated) {
      result[model.provider].push(model);
    }
  }

  return result;
}

/**
 * Get model info by ID
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODEL_CATALOG[modelId];
}

/**
 * Get provider name for display
 */
export function getProviderDisplayName(provider: ProviderType): string {
  return PROVIDER_CONFIGS[provider]?.name || provider;
}

// ============================================================================
// Comparison Execution
// ============================================================================

/**
 * Create a new comparison result object
 */
export function createComparisonResult(
  prompt: string,
  modelIds: string[],
  systemPrompt?: string
): ComparisonResult {
  const id = `cmp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  return {
    id,
    prompt,
    systemPrompt,
    responses: modelIds.map((modelId) => {
      const model = MODEL_CATALOG[modelId];
      return {
        modelId,
        modelName: model?.name || modelId,
        provider: model?.provider || 'openrouter',
        content: '',
        metrics: {
          timeToFirstToken: 0,
          totalTime: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          responseLength: 0,
          wordCount: 0,
          estimatedCost: 0,
          tokensPerSecond: 0,
        },
        status: 'pending',
        startedAt: Date.now(),
      };
    }),
    startedAt: Date.now(),
    status: 'running',
  };
}

/**
 * Update a model response in the comparison result
 */
export function updateModelResponse(
  result: ComparisonResult,
  modelId: string,
  updates: Partial<ModelResponse>
): ComparisonResult {
  return {
    ...result,
    responses: result.responses.map((r) =>
      r.modelId === modelId ? { ...r, ...updates } : r
    ),
  };
}

/**
 * Finalize a model response with metrics
 */
export function finalizeModelResponse(
  result: ComparisonResult,
  modelId: string,
  content: string,
  options: ComparisonOptions
): ComparisonResult {
  const now = Date.now();
  const response = result.responses.find((r) => r.modelId === modelId);
  if (!response) return result;

  const inputTokens = estimateTokens((result.systemPrompt || '') + result.prompt);
  const outputTokens = estimateTokens(content);
  const totalTime = now - response.startedAt;

  const metrics: ComparisonMetrics = {
    timeToFirstToken: response.metrics.timeToFirstToken || totalTime / 2,
    totalTime,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    responseLength: content.length,
    wordCount: content.split(/\s+/).length,
    estimatedCost: calculateCost(modelId, inputTokens, outputTokens),
    tokensPerSecond: totalTime > 0 ? (outputTokens / totalTime) * 1000 : 0,
  };

  const qualityScore = options.evaluateQuality
    ? evaluateQuality(result.prompt, content)
    : undefined;

  return updateModelResponse(result, modelId, {
    content,
    metrics,
    qualityScore,
    status: 'completed',
    completedAt: now,
  });
}

/**
 * Mark a model response as failed
 */
export function failModelResponse(
  result: ComparisonResult,
  modelId: string,
  error: string
): ComparisonResult {
  return updateModelResponse(result, modelId, {
    status: 'error',
    error,
    completedAt: Date.now(),
  });
}

/**
 * Finalize the comparison result
 */
export function finalizeComparison(result: ComparisonResult): ComparisonResult {
  const completedResponses = result.responses.filter((r) => r.status === 'completed');
  const hasErrors = result.responses.some((r) => r.status === 'error');

  let status: ComparisonResult['status'] = 'completed';
  if (completedResponses.length === 0) {
    status = 'error';
  } else if (hasErrors || completedResponses.length < result.responses.length) {
    status = 'partial';
  }

  // Calculate rankings
  const rankings: ComparisonResult['rankings'] = {
    fastest: '',
    cheapest: '',
    mostVerbose: '',
    mostConcise: '',
  };

  if (completedResponses.length > 0) {
    // Sort by different criteria
    const byTime = [...completedResponses].sort(
      (a, b) => a.metrics.totalTime - b.metrics.totalTime
    );
    const byCost = [...completedResponses].sort(
      (a, b) => a.metrics.estimatedCost - b.metrics.estimatedCost
    );
    const byLength = [...completedResponses].sort(
      (a, b) => b.metrics.responseLength - a.metrics.responseLength
    );
    const byQuality = completedResponses
      .filter((r) => r.qualityScore)
      .sort((a, b) => (b.qualityScore?.overall || 0) - (a.qualityScore?.overall || 0));

    rankings.fastest = byTime[0]?.modelId || '';
    rankings.cheapest = byCost[0]?.modelId || '';
    rankings.mostVerbose = byLength[0]?.modelId || '';
    rankings.mostConcise = byLength[byLength.length - 1]?.modelId || '';
    if (byQuality.length > 0) {
      rankings.bestQuality = byQuality[0]?.modelId;
    }
  }

  return {
    ...result,
    completedAt: Date.now(),
    status,
    rankings,
  };
}

// ============================================================================
// Export/Import
// ============================================================================

/**
 * Export comparison result to JSON
 */
export function exportComparisonResult(result: ComparisonResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Export comparison result to CSV
 */
export function exportComparisonToCSV(result: ComparisonResult): string {
  const headers = [
    'Model',
    'Provider',
    'Status',
    'Time to First Token (ms)',
    'Total Time (ms)',
    'Input Tokens',
    'Output Tokens',
    'Response Length',
    'Word Count',
    'Estimated Cost ($)',
    'Tokens/sec',
    'Quality Score',
    'Error',
  ];

  const rows = result.responses.map((r) => [
    r.modelName,
    r.provider,
    r.status,
    r.metrics.timeToFirstToken.toFixed(0),
    r.metrics.totalTime.toFixed(0),
    r.metrics.inputTokens.toString(),
    r.metrics.outputTokens.toString(),
    r.metrics.responseLength.toString(),
    r.metrics.wordCount.toString(),
    r.metrics.estimatedCost.toFixed(6),
    r.metrics.tokensPerSecond.toFixed(2),
    r.qualityScore?.overall.toString() || 'N/A',
    r.error || '',
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  return csvContent;
}

/**
 * Import comparison result from JSON
 */
export function importComparisonResult(json: string): ComparisonResult | null {
  try {
    const parsed = JSON.parse(json);
    // Basic validation
    if (!parsed.id || !parsed.prompt || !Array.isArray(parsed.responses)) {
      return null;
    }
    return parsed as ComparisonResult;
  } catch {
    return null;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format duration in human readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format cost in human readable format
 */
export function formatCost(cost: number): string {
  if (cost === 0) return 'Free';
  if (cost < 0.0001) return '<$0.0001';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

/**
 * Get comparison summary text
 */
export function getComparisonSummary(result: ComparisonResult): string {
  const completed = result.responses.filter((r) => r.status === 'completed').length;
  const failed = result.responses.filter((r) => r.status === 'error').length;
  const total = result.responses.length;

  let summary = `Compared ${total} models: ${completed} completed`;
  if (failed > 0) {
    summary += `, ${failed} failed`;
  }

  if (result.rankings) {
    summary += `\n\nRankings:`;
    summary += `\n  Fastest: ${result.responses.find((r) => r.modelId === result.rankings?.fastest)?.modelName || 'N/A'}`;
    summary += `\n  Cheapest: ${result.responses.find((r) => r.modelId === result.rankings?.cheapest)?.modelName || 'N/A'}`;
    if (result.rankings.bestQuality) {
      summary += `\n  Best Quality: ${result.responses.find((r) => r.modelId === result.rankings?.bestQuality)?.modelName || 'N/A'}`;
    }
  }

  return summary;
}

/**
 * Calculate total cost for all responses
 */
export function getTotalCost(result: ComparisonResult): number {
  return result.responses.reduce((sum, r) => sum + r.metrics.estimatedCost, 0);
}

/**
 * Get average response time
 */
export function getAverageResponseTime(result: ComparisonResult): number {
  const completed = result.responses.filter((r) => r.status === 'completed');
  if (completed.length === 0) return 0;
  return completed.reduce((sum, r) => sum + r.metrics.totalTime, 0) / completed.length;
}
