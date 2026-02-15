import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ResponseValidator');
/**
 * Response Quality Validator
 * Ensures AI responses meet quality standards before returning to user
 */

export interface QualityScore {
  overall: number; // 0-100
  completeness: number;
  accuracy: number;
  relevance: number;
  codeQuality?: number;
  passed: boolean;
  issues: string[];
}

/**
 * Validate response quality
 */
export function validateResponse(
  userRequest: string,
  aiResponse: string,
  modelUsed: string
): QualityScore {
  const issues: string[] = [];
  let completeness = 100;
  let accuracy = 100;
  let relevance = 100;
  let codeQuality: number | undefined;

  // Check 1: Response length (not too short)
  if (aiResponse.length < 100) {
    completeness -= 30;
    issues.push('Response too short');
  }

  // Check 2: Actually addresses the request
  const requestKeywords = extractKeywords(userRequest);
  const responseKeywords = extractKeywords(aiResponse);
  const keywordMatch = requestKeywords.filter(k =>
    responseKeywords.includes(k)
  ).length / requestKeywords.length;

  if (keywordMatch < 0.3) {
    relevance -= 40;
    issues.push('Response may not address request');
  }

  // Check 3: If code was requested, check it exists
  if (userRequest.match(/(create|build|write|implement|add)/i)) {
    if (!aiResponse.includes('```')) {
      completeness -= 20;
      issues.push('No code block found');
    } else {
      // Validate code quality
      codeQuality = validateCodeQuality(aiResponse);
      if (codeQuality < 60) {
        issues.push('Code quality issues detected');
      }
    }
  }

  // Check 4: No obvious errors or placeholder text
  const errorIndicators = [
    /\[ERROR\]/i,
    /\[TODO\]/i,
    /\[PLACEHOLDER\]/i,
    /xxx+/i,
    /FIXME/i
  ];

  for (const indicator of errorIndicators) {
    if (indicator.test(aiResponse)) {
      accuracy -= 25;
      issues.push(`Contains placeholder or error marker: ${indicator}`);
      break;
    }
  }

  // Check 5: Free models should be held to slightly lower standards
  const isFreeModel = modelUsed.includes('gemini') ||
                       modelUsed.includes('deepseek-r1-qwen3') ||
                       modelUsed.includes('mistral-small-free');

  const qualityThreshold = isFreeModel ? 65 : 75;

  const overall = (completeness + accuracy + relevance + (codeQuality || 100)) / (codeQuality ? 4 : 3);
  const passed = overall >= qualityThreshold && issues.length < 3;

  return {
    overall: Math.round(overall),
    completeness: Math.round(completeness),
    accuracy: Math.round(accuracy),
    relevance: Math.round(relevance),
    codeQuality: codeQuality ? Math.round(codeQuality) : undefined,
    passed,
    issues
  };
}

/**
 * Extract keywords from text
 */
function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.match(/\b\w{4,}\b/g) || [];

  // Remove common words
  const stopWords = ['create', 'build', 'make', 'write', 'implement', 'using', 'with', 'that', 'this', 'have', 'from'];

  return words.filter(w => !stopWords.includes(w));
}

/**
 * Validate code quality in response
 */
function validateCodeQuality(response: string): number {
  let quality = 100;

  // Extract code blocks
  const codeBlocks = response.match(/```[\s\S]*?```/g) || [];

  if (codeBlocks.length === 0) return 0;

  for (const block of codeBlocks) {
    // Check for syntax issues
    if (block.includes('syntax error')) quality -= 20;

    // Check for proper formatting
    if (!block.includes('\n')) quality -= 10; // One-liners are suspicious

    // Check for comments (good practice)
    if (block.includes('//') || block.includes('/*')) {
      quality += 5; // Bonus for comments
    }

    // Check for imports/requires (shows completeness)
    if (block.match(/import |require\(|from /)) {
      quality += 5; // Bonus for imports
    }

    // Check for obvious TODO or incomplete code
    if (block.match(/TODO|FIXME|\.{3,}/)) quality -= 15;
  }

  return Math.max(0, Math.min(100, quality));
}

/**
 * Get fallback recommendation if quality is poor
 */
export function getFallbackRecommendation(
  qualityScore: QualityScore,
  currentModel: string
): { shouldRetry: boolean; recommendedModel?: string; reason: string } {
  // If quality is good, no fallback needed
  if (qualityScore.passed) {
    return {
      shouldRetry: false,
      reason: 'Quality acceptable'
    };
  }

  // If using free model and quality is poor, try paid model
  const isFreeModel = currentModel.includes('gemini') ||
                       currentModel.includes('deepseek-r1-qwen3') ||
                       currentModel.includes('mistral-small-free');

  if (isFreeModel && qualityScore.overall < 60) {
    return {
      shouldRetry: true,
      recommendedModel: 'deepseek-r1', // Cheap but good
      reason: `Free model quality too low (${qualityScore.overall}/100). Major issues: ${qualityScore.issues.join(', ')}`
    };
  }

  // If using cheap paid model and quality is poor, try premium
  if (currentModel.includes('deepseek-r1') && qualityScore.overall < 50) {
    return {
      shouldRetry: true,
      recommendedModel: 'claude-sonnet-4',
      reason: `DeepSeek quality too low (${qualityScore.overall}/100). Escalating to Claude.`
    };
  }

  // If already using premium and quality is poor, don't retry (it's the best we have)
  if (currentModel.includes('claude-sonnet') || currentModel.includes('gpt-4o')) {
    return {
      shouldRetry: false,
      reason: `Already using premium model. Quality: ${qualityScore.overall}/100. Issues: ${qualityScore.issues.join(', ')}`
    };
  }

  return {
    shouldRetry: false,
    reason: 'Quality borderline, accepting response'
  };
}

/**
 * Log quality metrics for analytics
 */
export function logQualityMetrics(
  modelUsed: string,
  qualityScore: QualityScore,
  retried: boolean
): void {
  logger.info(`📊 Quality Validation:`, {
    model: modelUsed,
    score: qualityScore.overall,
    passed: qualityScore.passed,
    retried,
    issues: qualityScore.issues.length
  });

  // In production, send to analytics
  // llmAnalytics.trackQuality({ modelUsed, ...qualityScore, retried });
}
