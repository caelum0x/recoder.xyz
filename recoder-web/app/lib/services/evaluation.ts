/**
 * AI Response Evaluation Framework
 * Inspired by vscode-ai-toolkit's evaluation system
 *
 * Features:
 * - Evaluate AI-generated code quality across multiple metrics
 * - Run evaluations against test datasets
 * - Support for custom evaluators
 * - Historical comparison and reporting
 */

import { detectLanguage, extractImports, extractExports } from './code-context';

// ============================================
// Types
// ============================================

/** Metric scores range from 0 to 1 */
export type Score = number;

/** Evaluation metric names */
export type MetricName = 'relevance' | 'correctness' | 'completeness' | 'style' | 'performance';

/** Evaluation result for a single metric */
export interface MetricResult {
  name: MetricName;
  score: Score;
  weight: number;
  details: string;
  suggestions?: string[];
}

/** Complete evaluation result for a single code sample */
export interface EvaluationResult {
  id: string;
  timestamp: number;
  request: string;
  generatedCode: string;
  filePath?: string;
  language: string;
  metrics: MetricResult[];
  overallScore: Score;
  passed: boolean;
  passThreshold: number;
  executionTime: number;
  errors?: string[];
  metadata?: Record<string, unknown>;
}

/** Test case for evaluation */
export interface TestCase {
  id: string;
  name: string;
  description?: string;
  request: string;
  expectedPatterns?: RegExp[];
  requiredImports?: string[];
  requiredExports?: string[];
  forbiddenPatterns?: RegExp[];
  minLines?: number;
  maxLines?: number;
  expectedLanguage?: string;
  customValidators?: CustomValidator[];
  referenceCode?: string;
  tags?: string[];
}

/** Test dataset containing multiple test cases */
export interface TestDataset {
  id: string;
  name: string;
  description?: string;
  testCases: TestCase[];
  defaultPassThreshold: number;
  metricWeights?: Partial<Record<MetricName, number>>;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

/** Custom validator function */
export interface CustomValidator {
  name: string;
  description?: string;
  validate: (code: string, testCase: TestCase) => CustomValidatorResult;
}

/** Result from a custom validator */
export interface CustomValidatorResult {
  passed: boolean;
  score: Score;
  message: string;
  details?: string;
}

/** Options for running evaluations */
export interface EvaluationOptions {
  passThreshold?: number;
  metricWeights?: Partial<Record<MetricName, number>>;
  skipMetrics?: MetricName[];
  customEvaluators?: CustomEvaluator[];
  timeout?: number;
  verbose?: boolean;
}

/** Custom evaluator interface */
export interface CustomEvaluator {
  name: string;
  description?: string;
  evaluate: (code: string, request: string, options?: EvaluationOptions) => Promise<MetricResult>;
}

/** Evaluation run summary */
export interface EvaluationRun {
  id: string;
  datasetId: string;
  datasetName: string;
  timestamp: number;
  results: EvaluationResult[];
  summary: EvaluationSummary;
  options: EvaluationOptions;
  duration: number;
}

/** Summary statistics for an evaluation run */
export interface EvaluationSummary {
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number;
  averageScore: number;
  metricAverages: Record<MetricName, number>;
  worstPerformingMetric: MetricName;
  bestPerformingMetric: MetricName;
  errors: number;
}

/** Comparison between two evaluation runs */
export interface EvaluationComparison {
  baseRun: EvaluationRun;
  compareRun: EvaluationRun;
  scoreDelta: number;
  passRateDelta: number;
  metricDeltas: Record<MetricName, number>;
  improved: string[];
  regressed: string[];
  unchanged: string[];
}

/** Export format for evaluation reports */
export interface EvaluationReport {
  generatedAt: number;
  runs: EvaluationRun[];
  comparison?: EvaluationComparison;
  format: 'json' | 'markdown' | 'html';
}

// ============================================
// Default Configuration
// ============================================

/** Default metric weights */
export const DEFAULT_METRIC_WEIGHTS: Record<MetricName, number> = {
  relevance: 0.25,
  correctness: 0.30,
  completeness: 0.20,
  style: 0.15,
  performance: 0.10,
};

/** Default pass threshold */
export const DEFAULT_PASS_THRESHOLD = 0.7;

/** Evaluation timeout in ms */
export const DEFAULT_TIMEOUT = 30000;

// ============================================
// Core Evaluation Functions
// ============================================

/**
 * Evaluate AI-generated code against a request
 */
export async function evaluateCode(
  code: string,
  request: string,
  filePath?: string,
  options: EvaluationOptions = {}
): Promise<EvaluationResult> {
  const startTime = performance.now();
  const id = generateId();
  const language = filePath ? detectLanguage(filePath) : detectLanguageFromCode(code);
  const passThreshold = options.passThreshold ?? DEFAULT_PASS_THRESHOLD;
  const weights = { ...DEFAULT_METRIC_WEIGHTS, ...options.metricWeights };

  const metrics: MetricResult[] = [];
  const errors: string[] = [];

  try {
    // Run each metric evaluation
    const metricsToRun: MetricName[] = ['relevance', 'correctness', 'completeness', 'style', 'performance'];
    const skipMetrics = options.skipMetrics || [];

    for (const metricName of metricsToRun) {
      if (skipMetrics.includes(metricName)) continue;

      try {
        const result = await evaluateMetric(metricName, code, request, language, weights[metricName]);
        metrics.push(result);
      } catch (error) {
        errors.push(`Failed to evaluate ${metricName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Run custom evaluators
    if (options.customEvaluators) {
      for (const evaluator of options.customEvaluators) {
        try {
          const result = await evaluator.evaluate(code, request, options);
          metrics.push(result);
        } catch (error) {
          errors.push(`Custom evaluator ${evaluator.name} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Calculate overall score
    const overallScore = calculateOverallScore(metrics);
    const passed = overallScore >= passThreshold;

    return {
      id,
      timestamp: Date.now(),
      request,
      generatedCode: code,
      filePath,
      language,
      metrics,
      overallScore,
      passed,
      passThreshold,
      executionTime: performance.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      id,
      timestamp: Date.now(),
      request,
      generatedCode: code,
      filePath,
      language,
      metrics,
      overallScore: 0,
      passed: false,
      passThreshold,
      executionTime: performance.now() - startTime,
      errors: [`Evaluation failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/**
 * Evaluate code against a test case
 */
export async function evaluateTestCase(
  code: string,
  testCase: TestCase,
  options: EvaluationOptions = {}
): Promise<EvaluationResult> {
  const result = await evaluateCode(code, testCase.request, undefined, options);

  // Apply test case specific validations
  const additionalMetrics: MetricResult[] = [];

  // Check expected patterns
  if (testCase.expectedPatterns) {
    const patternResult = evaluatePatterns(code, testCase.expectedPatterns, true);
    additionalMetrics.push(patternResult);
  }

  // Check forbidden patterns
  if (testCase.forbiddenPatterns) {
    const forbiddenResult = evaluatePatterns(code, testCase.forbiddenPatterns, false);
    additionalMetrics.push(forbiddenResult);
  }

  // Check required imports
  if (testCase.requiredImports) {
    const importResult = evaluateRequiredImports(code, testCase.requiredImports);
    additionalMetrics.push(importResult);
  }

  // Check required exports
  if (testCase.requiredExports) {
    const exportResult = evaluateRequiredExports(code, testCase.requiredExports);
    additionalMetrics.push(exportResult);
  }

  // Check line count
  if (testCase.minLines !== undefined || testCase.maxLines !== undefined) {
    const lineResult = evaluateLineCount(code, testCase.minLines, testCase.maxLines);
    additionalMetrics.push(lineResult);
  }

  // Run custom validators
  if (testCase.customValidators) {
    for (const validator of testCase.customValidators) {
      const validatorResult = validator.validate(code, testCase);
      additionalMetrics.push({
        name: 'relevance', // Custom validators contribute to relevance
        score: validatorResult.score,
        weight: 0.1,
        details: validatorResult.message,
        suggestions: validatorResult.details ? [validatorResult.details] : undefined,
      });
    }
  }

  // Merge additional metrics
  result.metrics.push(...additionalMetrics);
  result.overallScore = calculateOverallScore(result.metrics);
  result.passed = result.overallScore >= result.passThreshold;
  result.metadata = {
    testCaseId: testCase.id,
    testCaseName: testCase.name,
    tags: testCase.tags,
  };

  return result;
}

/**
 * Run evaluation against a test dataset
 */
export async function runEvaluationDataset(
  codeGenerator: (request: string) => Promise<string>,
  dataset: TestDataset,
  options: EvaluationOptions = {}
): Promise<EvaluationRun> {
  const startTime = performance.now();
  const runId = generateId();
  const results: EvaluationResult[] = [];
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  const mergedOptions: EvaluationOptions = {
    passThreshold: dataset.defaultPassThreshold,
    metricWeights: dataset.metricWeights,
    ...options,
  };

  for (const testCase of dataset.testCases) {
    try {
      // Generate code with timeout
      const code = await Promise.race([
        codeGenerator(testCase.request),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Code generation timeout')), timeout)
        ),
      ]);

      const result = await evaluateTestCase(code, testCase, mergedOptions);
      results.push(result);
    } catch (error) {
      results.push({
        id: generateId(),
        timestamp: Date.now(),
        request: testCase.request,
        generatedCode: '',
        language: testCase.expectedLanguage || 'unknown',
        metrics: [],
        overallScore: 0,
        passed: false,
        passThreshold: mergedOptions.passThreshold ?? DEFAULT_PASS_THRESHOLD,
        executionTime: 0,
        errors: [`Generation failed: ${error instanceof Error ? error.message : String(error)}`],
        metadata: {
          testCaseId: testCase.id,
          testCaseName: testCase.name,
        },
      });
    }
  }

  const summary = calculateSummary(results);

  return {
    id: runId,
    datasetId: dataset.id,
    datasetName: dataset.name,
    timestamp: Date.now(),
    results,
    summary,
    options: mergedOptions,
    duration: performance.now() - startTime,
  };
}

// ============================================
// Metric Evaluation Functions
// ============================================

/**
 * Evaluate a specific metric
 */
async function evaluateMetric(
  metricName: MetricName,
  code: string,
  request: string,
  language: string,
  weight: number
): Promise<MetricResult> {
  switch (metricName) {
    case 'relevance':
      return evaluateRelevance(code, request, weight);
    case 'correctness':
      return evaluateCorrectness(code, language, weight);
    case 'completeness':
      return evaluateCompleteness(code, request, weight);
    case 'style':
      return evaluateStyle(code, language, weight);
    case 'performance':
      return evaluatePerformance(code, language, weight);
    default:
      throw new Error(`Unknown metric: ${metricName}`);
  }
}

/**
 * Evaluate relevance: Does the code address the request?
 */
function evaluateRelevance(code: string, request: string, weight: number): MetricResult {
  const suggestions: string[] = [];
  let score = 1.0;

  // Extract key terms from request
  const requestTerms = extractKeyTerms(request);
  const codeTerms = extractKeyTerms(code);

  // Check term overlap
  const matchedTerms = requestTerms.filter(term =>
    codeTerms.some(codeTerm => codeTerm.toLowerCase().includes(term.toLowerCase()))
  );
  const termOverlap = requestTerms.length > 0 ? matchedTerms.length / requestTerms.length : 0;

  // Penalize for low term overlap
  if (termOverlap < 0.5) {
    score -= 0.3;
    suggestions.push('Code may not fully address the request. Consider including more relevant functionality.');
  }

  // Check if code is too short for a meaningful implementation
  const lines = code.split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 3) {
    score -= 0.2;
    suggestions.push('Code seems too minimal. Consider providing a more complete implementation.');
  }

  // Check for placeholder comments
  if (/\/\/\s*(TODO|FIXME|IMPLEMENT|placeholder)/i.test(code)) {
    score -= 0.2;
    suggestions.push('Code contains placeholder comments. Consider implementing the missing functionality.');
  }

  score = Math.max(0, Math.min(1, score));

  return {
    name: 'relevance',
    score,
    weight,
    details: `Term overlap: ${Math.round(termOverlap * 100)}%. Matched: ${matchedTerms.join(', ') || 'none'}`,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Evaluate correctness: Does the code work (no syntax errors)?
 */
function evaluateCorrectness(code: string, language: string, weight: number): MetricResult {
  const suggestions: string[] = [];
  let score = 1.0;
  const issues: string[] = [];

  // Check bracket balance
  const brackets: Array<[string, string]> = [['(', ')'], ['[', ']'], ['{', '}']];
  for (const [open, close] of brackets) {
    const openCount = (code.match(new RegExp(`\\${open}`, 'g')) || []).length;
    const closeCount = (code.match(new RegExp(`\\${close}`, 'g')) || []).length;
    if (openCount !== closeCount) {
      score -= 0.3;
      issues.push(`Unbalanced ${open}${close}: ${openCount} open, ${closeCount} close`);
    }
  }

  // Check for common syntax errors
  if (['typescript', 'tsx', 'javascript', 'jsx'].includes(language)) {
    // Unterminated strings
    const unbalancedStrings = (code.match(/[^\\]"/g) || []).length % 2 !== 0 ||
                              (code.match(/[^\\]'/g) || []).length % 2 !== 0;
    if (unbalancedStrings) {
      score -= 0.2;
      issues.push('Potentially unterminated string');
    }

    // Missing function keywords
    if (/^\s*\w+\s*\([^)]*\)\s*{/m.test(code) && !/function|const|let|var|class|=>/.test(code)) {
      score -= 0.1;
      issues.push('Possible missing function declaration');
    }

    // JSX-specific checks
    if (['tsx', 'jsx'].includes(language)) {
      if (/class=["']/.test(code)) {
        score -= 0.1;
        suggestions.push('Use "className" instead of "class" in JSX');
      }
    }
  }

  // JSON validation
  if (language === 'json') {
    try {
      JSON.parse(code);
    } catch (e) {
      score = 0;
      issues.push(`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`);
    }
  }

  if (issues.length > 0) {
    suggestions.push(...issues.map(i => `Fix: ${i}`));
  }

  score = Math.max(0, Math.min(1, score));

  return {
    name: 'correctness',
    score,
    weight,
    details: issues.length > 0 ? issues.join('; ') : 'No syntax issues detected',
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Evaluate completeness: Are all requirements met?
 */
function evaluateCompleteness(code: string, request: string, weight: number): MetricResult {
  const suggestions: string[] = [];
  let score = 1.0;

  // Check for imports if request mentions external libraries
  const libraryMentions = request.match(/(?:use|using|with|import)\s+(\w+)/gi) || [];
  if (libraryMentions.length > 0) {
    const imports = extractImports(code, 'typescript');
    const hasImports = imports.length > 0;
    if (!hasImports && libraryMentions.length > 0) {
      score -= 0.2;
      suggestions.push('Consider adding necessary imports for mentioned libraries');
    }
  }

  // Check for exports if likely a module
  if (/component|function|class|module|hook/i.test(request)) {
    const exports = extractExports(code, 'typescript');
    if (exports.length === 0 && !/export\s+default/.test(code)) {
      score -= 0.1;
      suggestions.push('Consider exporting the main component/function');
    }
  }

  // Check for type definitions in TypeScript requests
  if (/typescript|typed|interface|type/i.test(request)) {
    if (!/interface\s+\w+|type\s+\w+\s*=/.test(code)) {
      score -= 0.15;
      suggestions.push('Consider adding TypeScript type definitions');
    }
  }

  // Check for error handling if request implies it
  if (/error|catch|handle|exception/i.test(request)) {
    if (!/try\s*{|catch\s*\(|\.catch\(|throw\s+/.test(code)) {
      score -= 0.15;
      suggestions.push('Consider adding error handling');
    }
  }

  // Check for tests if request mentions testing
  if (/test|spec|unit|jest|mocha/i.test(request)) {
    if (!/describe\s*\(|it\s*\(|test\s*\(|expect\s*\(/.test(code)) {
      score -= 0.3;
      suggestions.push('Tests were requested but not implemented');
    }
  }

  score = Math.max(0, Math.min(1, score));

  return {
    name: 'completeness',
    score,
    weight,
    details: suggestions.length > 0 ? `${suggestions.length} completeness issues found` : 'Code appears complete',
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Evaluate style: Does it follow best practices?
 */
function evaluateStyle(code: string, language: string, weight: number): MetricResult {
  const suggestions: string[] = [];
  let score = 1.0;

  // Check naming conventions
  if (['typescript', 'tsx', 'javascript', 'jsx'].includes(language)) {
    // Variables should be camelCase
    const badVariableNames = code.match(/(?:const|let|var)\s+([A-Z_][A-Z0-9_]+)\s*=/g) || [];
    if (badVariableNames.length > 0) {
      score -= 0.05 * Math.min(badVariableNames.length, 3);
      suggestions.push('Use camelCase for variable names');
    }

    // Functions should be camelCase
    const badFunctionNames = code.match(/function\s+([A-Z_][A-Z0-9_]+)\s*\(/g) || [];
    if (badFunctionNames.length > 0) {
      score -= 0.05 * Math.min(badFunctionNames.length, 3);
      suggestions.push('Use camelCase for function names');
    }

    // React components should be PascalCase
    if (['tsx', 'jsx'].includes(language)) {
      const componentMatches = code.match(/(?:const|function)\s+([a-z]\w+)\s*=?\s*(?:\([^)]*\)\s*=>|\([^)]*\)\s*{)/g) || [];
      const hasJSX = /<\w+/.test(code);
      if (hasJSX && componentMatches.length > 0) {
        score -= 0.1;
        suggestions.push('Use PascalCase for React component names');
      }
    }
  }

  // Check for console statements
  const consoleStatements = (code.match(/console\.(log|debug|info|warn|error)\s*\(/g) || []).length;
  if (consoleStatements > 2) {
    score -= 0.1;
    suggestions.push('Remove unnecessary console statements for production code');
  }

  // Check for magic numbers
  const magicNumbers = code.match(/(?<![a-zA-Z0-9_])[0-9]{2,}(?![0-9])/g) || [];
  const filteredMagicNumbers = magicNumbers.filter(n => !['100', '1000', '10'].includes(n));
  if (filteredMagicNumbers.length > 3) {
    score -= 0.1;
    suggestions.push('Consider extracting magic numbers into named constants');
  }

  // Check for comments on complex code
  const lines = code.split('\n');
  const complexPatterns = /(?:if.*else.*if|switch|while|for.*for|\.map\(.*\.filter\()/;
  const hasComplexCode = lines.some(line => complexPatterns.test(line));
  const hasComments = /\/\/|\/\*/.test(code);
  if (hasComplexCode && !hasComments) {
    score -= 0.1;
    suggestions.push('Consider adding comments to explain complex logic');
  }

  // Check line length
  const longLines = lines.filter(line => line.length > 120);
  if (longLines.length > 0) {
    score -= 0.05 * Math.min(longLines.length, 4);
    suggestions.push('Break long lines for better readability (max 120 chars)');
  }

  score = Math.max(0, Math.min(1, score));

  return {
    name: 'style',
    score,
    weight,
    details: `${suggestions.length} style suggestions`,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Evaluate performance: Is the code efficient?
 */
function evaluatePerformance(code: string, language: string, weight: number): MetricResult {
  const suggestions: string[] = [];
  let score = 1.0;

  if (['typescript', 'tsx', 'javascript', 'jsx'].includes(language)) {
    // Check for nested loops (potential O(n^2) or worse)
    const nestedLoopPatterns = /for\s*\([^)]*\)\s*{[^}]*for\s*\(|\.forEach\([^)]*\)[^}]*\.forEach\(/;
    if (nestedLoopPatterns.test(code)) {
      score -= 0.15;
      suggestions.push('Nested loops detected - consider optimizing for better performance');
    }

    // Check for sync operations that should be async
    if (/(?:readFileSync|writeFileSync|execSync)\s*\(/.test(code)) {
      score -= 0.1;
      suggestions.push('Use async file/process operations to avoid blocking');
    }

    // Check for array operations that could be combined
    const chainedArrayOps = (code.match(/\.map\([^)]+\)\.filter\([^)]+\)|\.filter\([^)]+\)\.map\([^)]+\)/g) || []).length;
    if (chainedArrayOps > 1) {
      score -= 0.05;
      suggestions.push('Consider combining chained array operations for efficiency');
    }

    // Check for inefficient string concatenation in loops
    if (/for\s*\([^)]*\)\s*{[^}]*\+=/s.test(code)) {
      score -= 0.1;
      suggestions.push('Use array.join() instead of string concatenation in loops');
    }

    // React-specific performance checks
    if (['tsx', 'jsx'].includes(language)) {
      // Inline function in render
      if (/onClick=\{[^}]*=>[^}]*\}/.test(code)) {
        score -= 0.05;
        suggestions.push('Consider using useCallback for event handlers to prevent unnecessary re-renders');
      }

      // Missing key in list
      if (/\.map\([^)]+\)\s*$/m.test(code) && !/key=/.test(code)) {
        score -= 0.1;
        suggestions.push('Add key prop to list items for React reconciliation');
      }

      // Large inline objects
      if (/style=\{\{[^}]{50,}\}\}/.test(code)) {
        score -= 0.05;
        suggestions.push('Extract large inline styles to useMemo or outside the component');
      }
    }
  }

  score = Math.max(0, Math.min(1, score));

  return {
    name: 'performance',
    score,
    weight,
    details: suggestions.length > 0 ? `${suggestions.length} performance concerns found` : 'No obvious performance issues',
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

// ============================================
// Test Case Validators
// ============================================

/**
 * Evaluate expected/forbidden patterns
 */
function evaluatePatterns(code: string, patterns: RegExp[], shouldMatch: boolean): MetricResult {
  const matched = patterns.filter(p => p.test(code));
  const matchRatio = patterns.length > 0 ? matched.length / patterns.length : 1;

  const score = shouldMatch ? matchRatio : 1 - matchRatio;
  const name = shouldMatch ? 'relevance' : 'correctness';

  return {
    name,
    score,
    weight: 0.1,
    details: shouldMatch
      ? `Matched ${matched.length}/${patterns.length} expected patterns`
      : `${matched.length}/${patterns.length} forbidden patterns found`,
  };
}

/**
 * Evaluate required imports
 */
function evaluateRequiredImports(code: string, requiredImports: string[]): MetricResult {
  const imports = extractImports(code, 'typescript');
  const found = requiredImports.filter(req =>
    imports.some(imp => imp.includes(req))
  );
  const score = requiredImports.length > 0 ? found.length / requiredImports.length : 1;

  return {
    name: 'completeness',
    score,
    weight: 0.1,
    details: `Required imports: ${found.length}/${requiredImports.length}`,
    suggestions: found.length < requiredImports.length
      ? [`Missing imports: ${requiredImports.filter(r => !found.includes(r)).join(', ')}`]
      : undefined,
  };
}

/**
 * Evaluate required exports
 */
function evaluateRequiredExports(code: string, requiredExports: string[]): MetricResult {
  const exports = extractExports(code, 'typescript');
  const found = requiredExports.filter(req =>
    exports.some(exp => exp.includes(req)) || new RegExp(`export\\s+(?:default\\s+)?(?:function|const|class|let|var)\\s+${req}`).test(code)
  );
  const score = requiredExports.length > 0 ? found.length / requiredExports.length : 1;

  return {
    name: 'completeness',
    score,
    weight: 0.1,
    details: `Required exports: ${found.length}/${requiredExports.length}`,
    suggestions: found.length < requiredExports.length
      ? [`Missing exports: ${requiredExports.filter(r => !found.includes(r)).join(', ')}`]
      : undefined,
  };
}

/**
 * Evaluate line count constraints
 */
function evaluateLineCount(code: string, minLines?: number, maxLines?: number): MetricResult {
  const lines = code.split('\n').filter(line => line.trim().length > 0).length;
  let score = 1.0;
  const details: string[] = [];

  if (minLines !== undefined && lines < minLines) {
    score -= Math.min(0.5, (minLines - lines) / minLines);
    details.push(`Code too short: ${lines} lines (min: ${minLines})`);
  }

  if (maxLines !== undefined && lines > maxLines) {
    score -= Math.min(0.5, (lines - maxLines) / maxLines);
    details.push(`Code too long: ${lines} lines (max: ${maxLines})`);
  }

  return {
    name: 'style',
    score: Math.max(0, score),
    weight: 0.05,
    details: details.length > 0 ? details.join('; ') : `Line count: ${lines}`,
  };
}

// ============================================
// Comparison & Reporting
// ============================================

/**
 * Compare two evaluation runs
 */
export function compareRuns(baseRun: EvaluationRun, compareRun: EvaluationRun): EvaluationComparison {
  const improved: string[] = [];
  const regressed: string[] = [];
  const unchanged: string[] = [];

  // Compare individual test results
  for (const baseResult of baseRun.results) {
    const testCaseId = baseResult.metadata?.testCaseId as string;
    const compareResult = compareRun.results.find(r => r.metadata?.testCaseId === testCaseId);

    if (compareResult) {
      const delta = compareResult.overallScore - baseResult.overallScore;
      if (delta > 0.05) {
        improved.push(testCaseId);
      } else if (delta < -0.05) {
        regressed.push(testCaseId);
      } else {
        unchanged.push(testCaseId);
      }
    }
  }

  // Calculate metric deltas
  const metricDeltas: Record<MetricName, number> = {
    relevance: compareRun.summary.metricAverages.relevance - baseRun.summary.metricAverages.relevance,
    correctness: compareRun.summary.metricAverages.correctness - baseRun.summary.metricAverages.correctness,
    completeness: compareRun.summary.metricAverages.completeness - baseRun.summary.metricAverages.completeness,
    style: compareRun.summary.metricAverages.style - baseRun.summary.metricAverages.style,
    performance: compareRun.summary.metricAverages.performance - baseRun.summary.metricAverages.performance,
  };

  return {
    baseRun,
    compareRun,
    scoreDelta: compareRun.summary.averageScore - baseRun.summary.averageScore,
    passRateDelta: compareRun.summary.passRate - baseRun.summary.passRate,
    metricDeltas,
    improved,
    regressed,
    unchanged,
  };
}

/**
 * Generate evaluation report
 */
export function generateReport(
  runs: EvaluationRun[],
  format: 'json' | 'markdown' | 'html' = 'markdown',
  comparison?: EvaluationComparison
): EvaluationReport {
  return {
    generatedAt: Date.now(),
    runs,
    comparison,
    format,
  };
}

/**
 * Format report to string
 */
export function formatReport(report: EvaluationReport): string {
  switch (report.format) {
    case 'json':
      return JSON.stringify(report, null, 2);
    case 'markdown':
      return formatMarkdownReport(report);
    case 'html':
      return formatHtmlReport(report);
    default:
      return formatMarkdownReport(report);
  }
}

/**
 * Format report as markdown
 */
function formatMarkdownReport(report: EvaluationReport): string {
  const lines: string[] = [];
  lines.push('# AI Code Evaluation Report');
  lines.push(`Generated: ${new Date(report.generatedAt).toISOString()}`);
  lines.push('');

  for (const run of report.runs) {
    lines.push(`## ${run.datasetName}`);
    lines.push(`Run ID: ${run.id}`);
    lines.push(`Date: ${new Date(run.timestamp).toISOString()}`);
    lines.push(`Duration: ${(run.duration / 1000).toFixed(2)}s`);
    lines.push('');

    lines.push('### Summary');
    lines.push(`- **Pass Rate:** ${(run.summary.passRate * 100).toFixed(1)}%`);
    lines.push(`- **Average Score:** ${(run.summary.averageScore * 100).toFixed(1)}%`);
    lines.push(`- **Tests:** ${run.summary.passed}/${run.summary.totalTests} passed`);
    lines.push('');

    lines.push('### Metric Averages');
    for (const [metric, value] of Object.entries(run.summary.metricAverages)) {
      lines.push(`- **${metric}:** ${(value * 100).toFixed(1)}%`);
    }
    lines.push('');

    lines.push('### Results');
    lines.push('| Test | Score | Status |');
    lines.push('|------|-------|--------|');
    for (const result of run.results) {
      const name = result.metadata?.testCaseName || result.id;
      const status = result.passed ? 'PASS' : 'FAIL';
      lines.push(`| ${name} | ${(result.overallScore * 100).toFixed(1)}% | ${status} |`);
    }
    lines.push('');
  }

  if (report.comparison) {
    lines.push('## Comparison');
    const c = report.comparison;
    lines.push(`- **Score Change:** ${c.scoreDelta > 0 ? '+' : ''}${(c.scoreDelta * 100).toFixed(1)}%`);
    lines.push(`- **Pass Rate Change:** ${c.passRateDelta > 0 ? '+' : ''}${(c.passRateDelta * 100).toFixed(1)}%`);
    lines.push(`- **Improved:** ${c.improved.length} tests`);
    lines.push(`- **Regressed:** ${c.regressed.length} tests`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format report as HTML
 */
function formatHtmlReport(report: EvaluationReport): string {
  const markdown = formatMarkdownReport(report);
  // Basic markdown to HTML conversion
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>AI Code Evaluation Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
    .pass { color: green; }
    .fail { color: red; }
  </style>
</head>
<body>
  <pre>${markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</body>
</html>`;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate overall score from metrics
 */
function calculateOverallScore(metrics: MetricResult[]): number {
  if (metrics.length === 0) return 0;

  const totalWeight = metrics.reduce((sum, m) => sum + m.weight, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = metrics.reduce((sum, m) => sum + m.score * m.weight, 0);
  return weightedSum / totalWeight;
}

/**
 * Calculate summary statistics for an evaluation run
 */
function calculateSummary(results: EvaluationResult[]): EvaluationSummary {
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const errors = results.filter(r => r.errors && r.errors.length > 0).length;
  const averageScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
    : 0;

  // Calculate metric averages
  const metricTotals: Record<MetricName, { sum: number; count: number }> = {
    relevance: { sum: 0, count: 0 },
    correctness: { sum: 0, count: 0 },
    completeness: { sum: 0, count: 0 },
    style: { sum: 0, count: 0 },
    performance: { sum: 0, count: 0 },
  };

  for (const result of results) {
    for (const metric of result.metrics) {
      if (metric.name in metricTotals) {
        metricTotals[metric.name].sum += metric.score;
        metricTotals[metric.name].count += 1;
      }
    }
  }

  const metricAverages: Record<MetricName, number> = {
    relevance: metricTotals.relevance.count > 0 ? metricTotals.relevance.sum / metricTotals.relevance.count : 0,
    correctness: metricTotals.correctness.count > 0 ? metricTotals.correctness.sum / metricTotals.correctness.count : 0,
    completeness: metricTotals.completeness.count > 0 ? metricTotals.completeness.sum / metricTotals.completeness.count : 0,
    style: metricTotals.style.count > 0 ? metricTotals.style.sum / metricTotals.style.count : 0,
    performance: metricTotals.performance.count > 0 ? metricTotals.performance.sum / metricTotals.performance.count : 0,
  };

  // Find best and worst metrics
  const metricEntries = Object.entries(metricAverages) as Array<[MetricName, number]>;
  const sorted = metricEntries.sort((a, b) => a[1] - b[1]);

  return {
    totalTests: results.length,
    passed,
    failed,
    passRate: results.length > 0 ? passed / results.length : 0,
    averageScore,
    metricAverages,
    worstPerformingMetric: sorted[0]?.[0] || 'relevance',
    bestPerformingMetric: sorted[sorted.length - 1]?.[0] || 'relevance',
    errors,
  };
}

/**
 * Extract key terms from text
 */
function extractKeyTerms(text: string): string[] {
  // Remove code blocks and punctuation
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[^\w\s]/g, ' ')
    .toLowerCase();

  // Split into words and filter
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
    'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'for', 'with', 'about',
    'from', 'into', 'during', 'before', 'after', 'above', 'below', 'to', 'of', 'in', 'on', 'at', 'by']);

  return cleaned
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .filter((word, index, self) => self.indexOf(word) === index); // unique
}

/**
 * Detect language from code content
 */
function detectLanguageFromCode(code: string): string {
  if (/import\s+React|from\s+['"]react['"]|<[A-Z]\w+/.test(code)) {
    return /:\s*\w+|interface\s+\w+|type\s+\w+\s*=/.test(code) ? 'tsx' : 'jsx';
  }
  if (/interface\s+\w+|type\s+\w+\s*=|:\s*\w+(\[\])?(\s*\||\s*&)?/.test(code)) {
    return 'typescript';
  }
  if (/function\s+\w+|const\s+\w+\s*=|let\s+\w+|var\s+\w+/.test(code)) {
    return 'javascript';
  }
  if (/^[\s\n]*\{[\s\S]*\}[\s\n]*$/.test(code.trim())) {
    try {
      JSON.parse(code);
      return 'json';
    } catch {
      // Not JSON
    }
  }
  if (/def\s+\w+|class\s+\w+:|import\s+\w+|from\s+\w+\s+import/.test(code)) {
    return 'python';
  }
  return 'unknown';
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `eval_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================
// Dataset Creation Helpers
// ============================================

/**
 * Create a new test dataset
 */
export function createDataset(
  name: string,
  testCases: TestCase[],
  options: Partial<TestDataset> = {}
): TestDataset {
  return {
    id: generateId(),
    name,
    testCases,
    defaultPassThreshold: options.defaultPassThreshold ?? DEFAULT_PASS_THRESHOLD,
    metricWeights: options.metricWeights,
    description: options.description,
    tags: options.tags,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Create a new test case
 */
export function createTestCase(
  name: string,
  request: string,
  options: Partial<TestCase> = {}
): TestCase {
  return {
    id: generateId(),
    name,
    request,
    ...options,
  };
}

/**
 * Create a custom evaluator
 */
export function createCustomEvaluator(
  name: string,
  evaluateFn: (code: string, request: string) => Promise<{ score: number; details: string; suggestions?: string[] }>,
  options: { weight?: number; description?: string } = {}
): CustomEvaluator {
  return {
    name,
    description: options.description,
    evaluate: async (code, request) => {
      const result = await evaluateFn(code, request);
      return {
        name: 'relevance', // Custom evaluators contribute to overall score
        score: result.score,
        weight: options.weight ?? 0.1,
        details: result.details,
        suggestions: result.suggestions,
      };
    },
  };
}

// ============================================
// Built-in Test Datasets
// ============================================

/**
 * Basic React component test dataset
 */
export const REACT_COMPONENT_DATASET: TestDataset = createDataset(
  'React Components',
  [
    createTestCase('Button Component', 'Create a React button component with onClick handler', {
      expectedPatterns: [/function|const.*=.*=>/, /<button/i, /onClick/],
      requiredImports: ['react'],
    }),
    createTestCase('Input Component', 'Create a controlled input component with onChange', {
      expectedPatterns: [/useState/, /<input/i, /onChange/, /value/],
      requiredImports: ['react'],
    }),
    createTestCase('List Component', 'Create a component that renders a list of items with map', {
      expectedPatterns: [/\.map\s*\(/, /key=/],
      requiredImports: ['react'],
    }),
  ],
  {
    description: 'Tests for basic React component patterns',
    tags: ['react', 'components'],
  }
);

/**
 * TypeScript utility functions test dataset
 */
export const TYPESCRIPT_UTILS_DATASET: TestDataset = createDataset(
  'TypeScript Utilities',
  [
    createTestCase('Array utility', 'Create a TypeScript function to chunk an array into smaller arrays', {
      expectedPatterns: [/function|const/, /:\s*\w+\[\]/, /Array|\.slice|\.splice/],
      requiredExports: ['chunk'],
    }),
    createTestCase('Object utility', 'Create a TypeScript function to deep merge two objects', {
      expectedPatterns: [/function|const/, /Record|object|Object/, /typeof.*===.*object/],
      requiredExports: ['deepMerge'],
    }),
    createTestCase('String utility', 'Create a TypeScript function to truncate a string with ellipsis', {
      expectedPatterns: [/function|const/, /string/, /\.length|\.slice|\.substring/],
      requiredExports: ['truncate'],
    }),
  ],
  {
    description: 'Tests for TypeScript utility functions',
    tags: ['typescript', 'utilities'],
  }
);
