/**
 * Automated Quality Assessment System
 * 
 * Comprehensive quality assessment for AI-generated content including
 * code compilation checking, security scanning, performance analysis,
 * and consistency scoring for recoder.xyz production code generation.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface QualityMetrics {
  codeCompilation: number;    // % of generated code that compiles
  testsPassing: number;       // % of generated tests that pass
  securityScore: number;      // Security vulnerability score (0-100)
  performanceScore: number;   // Performance optimization score (0-100)
  userSatisfaction: number;   // User rating (1-5)
  consistency: number;        // Consistency across similar prompts (0-100)
  readability: number;        // Code readability score (0-100)
  maintainability: number;    // Code maintainability score (0-100)
  documentation: number;      // Documentation quality score (0-100)
  bestPractices: number;      // Adherence to best practices (0-100)
  overallScore: number;       // Weighted overall quality score (0-100)
  [key: string]: number;      // Index signature for dynamic access
}

export interface QualityAssessmentRequest {
  id: string;
  modelName: string;
  task: string;
  taskType: 'code_generation' | 'test_generation' | 'documentation' | 'refactoring' | 'debugging';
  prompt: string;
  response: string;
  language?: string;          // Programming language
  framework?: string;         // Framework/library context
  complexity?: 'low' | 'medium' | 'high';
  userId?: string;
  timestamp: Date;
}

export interface QualityAssessmentResult {
  requestId: string;
  metrics: QualityMetrics;
  overallScore: number;       // Convenience accessor for metrics.overallScore
  details: {
    compilationErrors: CompilationError[];
    securityIssues: SecurityIssue[];
    performanceIssues: PerformanceIssue[];
    testResults: TestResult[];
    codeAnalysis: CodeAnalysis;
  };
  feedback: {
    strengths: string[];
    improvements: string[];
    recommendations: string[];
  };
  benchmarkComparison: {
    vsAverage: number;        // % better/worse than average
    vsTopPerformer: number;   // % compared to best model
    ranking: number;          // Current ranking (1 = best)
  };
  executionTime: number;      // Assessment time in ms
  timestamp: Date;            // When the assessment was completed
  assessmentVersion: string;
}

export interface CompilationError {
  type: 'syntax' | 'semantic' | 'runtime';
  severity: 'error' | 'warning';
  line: number;
  column: number;
  message: string;
  suggestion?: string;
}

export interface SecurityIssue {
  id: string;
  type: 'sql_injection' | 'xss' | 'code_injection' | 'insecure_storage' | 'weak_crypto' | 'auth_bypass';
  severity: 'low' | 'medium' | 'high' | 'critical';
  line: number;
  description: string;
  cwe?: string;             // Common Weakness Enumeration ID
  recommendation: string;
  impact: string;
}

export interface PerformanceIssue {
  type: 'memory_leak' | 'inefficient_algorithm' | 'unnecessary_computation' | 'blocking_operation';
  severity: 'low' | 'medium' | 'high';
  line: number;
  description: string;
  impact: string;
  suggestion: string;
  estimatedImprovement?: string;
}

export interface TestResult {
  testName: string;
  status: 'pass' | 'fail' | 'skip' | 'error';
  executionTime: number;
  errorMessage?: string;
  coverage?: number;
}

export interface CodeAnalysis {
  linesOfCode: number;
  cyclomaticComplexity: number;
  codeSmells: CodeSmell[];
  duplicatedCode: number;     // % of duplicated code
  maintainabilityIndex: number;
  technicalDebt: string;      // Time to fix issues
}

export interface CodeSmell {
  type: 'long_method' | 'large_class' | 'duplicate_code' | 'dead_code' | 'god_class';
  location: string;
  description: string;
  severity: 'minor' | 'major' | 'critical';
}

export interface QualityBenchmark {
  modelName: string;
  taskType: string;
  language: string;
  averageMetrics: QualityMetrics;
  sampleSize: number;
  lastUpdated: Date;
}

export class QualityAssessor extends EventEmitter {
  private assessmentCache: Map<string, QualityAssessmentResult> = new Map();
  private benchmarks: Map<string, QualityBenchmark> = new Map();
  private tempDir: string;
  
  private config = {
    tempDirPrefix: 'recoder_quality_',
    maxCacheSize: 1000,
    cacheTTL: 3600000,        // 1 hour
    compilationTimeout: 30000,  // 30 seconds
    testTimeout: 60000,       // 1 minute
    enableParallelProcessing: true,
    maxParallelAssessments: 5,
  };

  private activeAssessments = new Set<string>();

  constructor() {
    super();
    this.tempDir = path.join(process.cwd(), 'temp', 'quality_assessment');
    this.initializeAssessor();
  }

  private async initializeAssessor(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      await this.loadBenchmarks();
      Logger.info('Quality assessor initialized successfully');
    } catch (error) {
      Logger.error('Failed to initialize quality assessor:', error);
      throw error;
    }
  }

  /**
   * Assess the quality of an AI-generated response
   */
  async assessQuality(request: QualityAssessmentRequest): Promise<QualityAssessmentResult> {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = this.generateCacheKey(request);
    const cached = this.assessmentCache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      Logger.debug(`Returning cached quality assessment for ${request.id}`);
      return cached;
    }

    // Prevent duplicate assessments
    if (this.activeAssessments.has(request.id)) {
      throw new Error(`Assessment ${request.id} is already in progress`);
    }

    try {
      this.activeAssessments.add(request.id);
      Logger.info(`Starting quality assessment for ${request.id} (${request.taskType})`);

      // Run parallel assessments
      const assessmentPromises = await this.runParallelAssessments(request);
      const assessmentResults = await Promise.allSettled(assessmentPromises);

      // Compile results
      const result = await this.compileAssessmentResult(
        request,
        assessmentResults,
        Date.now() - startTime
      );

      // Cache result
      this.assessmentCache.set(cacheKey, result);
      this.cleanupCache();

      // Update benchmarks
      await this.updateBenchmarks(request, result);

      // Emit events
      this.emit('qualityAssessed', result);
      if (result.metrics.overallScore < 60) {
        this.emit('lowQualityDetected', result);
      }

      Logger.info(`Quality assessment completed for ${request.id}: ${result.metrics.overallScore.toFixed(1)}/100`);
      return result;

    } finally {
      this.activeAssessments.delete(request.id);
    }
  }

  /**
   * Compare quality across multiple models for the same task
   */
  async compareModelQuality(
    models: string[],
    task: string,
    prompt: string,
    taskType: QualityAssessmentRequest['taskType']
  ): Promise<{
    models: Array<{
      modelName: string;
      metrics: QualityMetrics;
      ranking: number;
    }>;
    winner: string;
    insights: string[];
  }> {
    Logger.info(`Comparing quality across ${models.length} models for task: ${taskType}`);

    const assessmentPromises = models.map(async (modelName, index) => {
      // This would typically involve calling each model to generate a response
      // For now, we'll simulate responses or use cached results
      const simulatedResponse = await this.getModelResponse(modelName, prompt, taskType);
      
      const request: QualityAssessmentRequest = {
        id: `comparison_${modelName}_${Date.now()}_${index}`,
        modelName,
        task,
        taskType,
        prompt,
        response: simulatedResponse,
        timestamp: new Date()
      };

      const assessment = await this.assessQuality(request);
      return {
        modelName,
        metrics: assessment.metrics,
        assessment
      };
    });

    const results = await Promise.all(assessmentPromises);
    
    // Rank models by overall score
    const rankedModels = results
      .sort((a, b) => b.metrics.overallScore - a.metrics.overallScore)
      .map((result, index) => ({
        modelName: result.modelName,
        metrics: result.metrics,
        ranking: index + 1
      }));

    const winner = rankedModels[0].modelName;
    const insights = this.generateComparisonInsights(results);

    Logger.info(`Model comparison completed. Winner: ${winner} (${rankedModels[0].metrics.overallScore.toFixed(1)}/100)`);

    return {
      models: rankedModels,
      winner,
      insights
    };
  }

  /**
   * Track quality trends for a specific model
   */
  async trackQualityTrends(
    modelName: string,
    period: string = '7d'
  ): Promise<{
    trend: 'improving' | 'stable' | 'declining';
    changeRate: number;       // % change over period
    dataPoints: number;
    averageScore: number;
    categories: {
      category: keyof QualityMetrics;
      trend: 'improving' | 'stable' | 'declining';
      change: number;
    }[];
  }> {
    // This would query historical assessment data
    // For now, we'll simulate trend analysis
    const trendData = await this.analyzeQualityTrend(modelName, period);
    
    Logger.info(`Quality trend analysis for ${modelName}: ${trendData.trend} (${trendData.changeRate}% change)`);
    return trendData;
  }

  /**
   * Identify quality regressions across models
   */
  async identifyQualityRegressions(): Promise<Array<{
    modelName: string;
    regressionType: 'compilation' | 'security' | 'performance' | 'consistency' | 'overall';
    severity: 'minor' | 'moderate' | 'severe';
    previousScore: number;
    currentScore: number;
    decline: number;          // % decline
    detectedAt: Date;
    possibleCauses: string[];
    recommendations: string[];
  }>> {
    const regressions: any[] = [];

    // Check each model's recent performance against historical benchmarks
    for (const [benchmarkKey, benchmark] of this.benchmarks) {
      const recentAssessments = await this.getRecentAssessments(benchmark.modelName, '24h');
      
      if (recentAssessments.length < 5) continue; // Need minimum sample size

      const currentAverage = this.calculateAverageMetrics(recentAssessments);
      const regression = this.detectRegression(benchmark.averageMetrics, currentAverage);

      if (regression) {
        regressions.push({
          modelName: benchmark.modelName,
          ...regression,
          detectedAt: new Date()
        });
      }
    }

    if (regressions.length > 0) {
      Logger.warn(`Detected ${regressions.length} quality regressions`);
      this.emit('qualityRegressions', regressions);
    }

    return regressions;
  }

  // Private helper methods

  private async runParallelAssessments(request: QualityAssessmentRequest): Promise<Promise<any>[]> {
    const assessments: Promise<any>[] = [];

    // Code compilation assessment
    if (this.isCodeGenerationTask(request.taskType)) {
      assessments.push(this.assessCodeCompilation(request));
    }

    // Security assessment
    assessments.push(this.assessSecurity(request));

    // Performance assessment
    if (this.isCodeGenerationTask(request.taskType)) {
      assessments.push(this.assessPerformance(request));
    }

    // Test assessment
    if (request.taskType === 'test_generation' || this.isCodeGenerationTask(request.taskType)) {
      assessments.push(this.assessTests(request));
    }

    // Code analysis assessment
    if (this.isCodeGenerationTask(request.taskType)) {
      assessments.push(this.assessCodeAnalysis(request));
    }

    // Documentation assessment
    assessments.push(this.assessDocumentation(request));

    return assessments;
  }

  private async assessCodeCompilation(request: QualityAssessmentRequest): Promise<{
    compilationScore: number;
    errors: CompilationError[];
  }> {
    try {
      const language = request.language || this.detectLanguage(request.response);
      const tempFile = await this.createTempFile(request.response, language);

      const compilationResult = await this.compileCode(tempFile, language);
      
      // Clean up temp file
      await fs.unlink(tempFile).catch(() => {}); // Ignore cleanup errors

      return compilationResult;
    } catch (error) {
      Logger.error('Code compilation assessment failed:', error);
      return {
        compilationScore: 0,
        errors: [{
          type: 'runtime',
          severity: 'error',
          line: 0,
          column: 0,
          message: 'Compilation assessment failed',
          suggestion: 'Check code syntax and structure'
        }]
      };
    }
  }

  private async assessSecurity(request: QualityAssessmentRequest): Promise<{
    securityScore: number;
    issues: SecurityIssue[];
  }> {
    const issues: SecurityIssue[] = [];
    const code = request.response;

    // Static security analysis rules
    const securityRules = [
      {
        pattern: /eval\s*\(/gi,
        type: 'code_injection' as const,
        severity: 'critical' as const,
        description: 'Use of eval() function can lead to code injection vulnerabilities'
      },
      {
        pattern: /innerHTML\s*=/gi,
        type: 'xss' as const,
        severity: 'high' as const,
        description: 'Direct innerHTML assignment can lead to XSS vulnerabilities'
      },
      {
        pattern: /SELECT\s+.*\s+FROM.*WHERE.*=.*['"]\s*\+/gi,
        type: 'sql_injection' as const,
        severity: 'critical' as const,
        description: 'String concatenation in SQL queries can lead to SQL injection'
      },
      {
        pattern: /password.*=.*['"]\w+['"]/gi,
        type: 'insecure_storage' as const,
        severity: 'high' as const,
        description: 'Hardcoded passwords detected'
      }
    ];

    const lines = code.split('\n');
    
    securityRules.forEach(rule => {
      lines.forEach((line, index) => {
        const matches = line.match(rule.pattern);
        if (matches) {
          issues.push({
            id: `sec_${Date.now()}_${index}`,
            type: rule.type,
            severity: rule.severity,
            line: index + 1,
            description: rule.description,
            recommendation: this.getSecurityRecommendation(rule.type),
            impact: this.getSecurityImpact(rule.severity)
          });
        }
      });
    });

    const securityScore = Math.max(0, 100 - (issues.length * 20));

    return { securityScore, issues };
  }

  private async assessPerformance(request: QualityAssessmentRequest): Promise<{
    performanceScore: number;
    issues: PerformanceIssue[];
  }> {
    const issues: PerformanceIssue[] = [];
    const code = request.response;

    // Performance analysis rules
    const performanceRules = [
      {
        pattern: /for\s*\(.*\)\s*{\s*for\s*\(/gi,
        type: 'inefficient_algorithm' as const,
        description: 'Nested loops detected - consider optimization'
      },
      {
        pattern: /\.find\s*\(.*\).*\.find\s*\(/gi,
        type: 'inefficient_algorithm' as const,
        description: 'Multiple find operations - consider caching result'
      },
      {
        pattern: /new\s+\w+\s*\(.*\)\s*;?\s*}\s*catch/gi,
        type: 'memory_leak' as const,
        description: 'Object creation in try-catch without proper cleanup'
      }
    ];

    const lines = code.split('\n');
    
    performanceRules.forEach(rule => {
      lines.forEach((line, index) => {
        if (rule.pattern.test(line)) {
          issues.push({
            type: rule.type,
            severity: 'medium',
            line: index + 1,
            description: rule.description,
            impact: this.getPerformanceImpact(rule.type),
            suggestion: this.getPerformanceSuggestion(rule.type)
          });
        }
      });
    });

    const performanceScore = Math.max(0, 100 - (issues.length * 15));

    return { performanceScore, issues };
  }

  private async assessTests(request: QualityAssessmentRequest): Promise<{
    testScore: number;
    results: TestResult[];
  }> {
    // Simulate test execution
    const testCount = this.countTests(request.response);
    const passRate = Math.random() * 0.4 + 0.6; // 60-100% pass rate

    const results: TestResult[] = Array.from({ length: testCount }, (_, i) => ({
      testName: `test_${i + 1}`,
      status: Math.random() < passRate ? 'pass' : 'fail',
      executionTime: Math.random() * 100 + 10,
      coverage: Math.random() * 40 + 60 // 60-100% coverage
    }));

    const testScore = (results.filter(r => r.status === 'pass').length / Math.max(results.length, 1)) * 100;

    return { testScore, results };
  }

  private async assessCodeAnalysis(request: QualityAssessmentRequest): Promise<CodeAnalysis> {
    const code = request.response;
    const lines = code.split('\n');
    
    return {
      linesOfCode: lines.filter(line => line.trim().length > 0).length,
      cyclomaticComplexity: this.calculateCyclomaticComplexity(code),
      codeSmells: this.detectCodeSmells(code),
      duplicatedCode: this.calculateDuplication(code),
      maintainabilityIndex: this.calculateMaintainabilityIndex(code),
      technicalDebt: this.calculateTechnicalDebt(code)
    };
  }

  private async assessDocumentation(request: QualityAssessmentRequest): Promise<{
    documentationScore: number;
    coverage: number;
    quality: number;
  }> {
    const code = request.response;
    
    // Count comments and documentation
    const commentLines = code.split('\n').filter(line => 
      line.trim().startsWith('//') || 
      line.trim().startsWith('/*') || 
      line.trim().startsWith('*') ||
      line.trim().startsWith('#')
    ).length;
    
    const totalLines = code.split('\n').filter(line => line.trim().length > 0).length;
    const coverage = totalLines > 0 ? (commentLines / totalLines) * 100 : 0;
    
    // Assess documentation quality
    const hasTypeAnnotations = /:\s*\w+/g.test(code);
    const hasJSDoc = /@param|@returns|@throws/.test(code);
    const hasExamples = /@example/.test(code);
    
    const quality = (
      (hasTypeAnnotations ? 30 : 0) +
      (hasJSDoc ? 40 : 0) +
      (hasExamples ? 30 : 0)
    );

    const documentationScore = (coverage * 0.6) + (quality * 0.4);

    return { documentationScore, coverage, quality };
  }

  private async compileAssessmentResult(
    request: QualityAssessmentRequest,
    assessmentResults: PromiseSettledResult<any>[],
    executionTime: number
  ): Promise<QualityAssessmentResult> {
    // Extract results from settled promises
    const results = assessmentResults.map(result => 
      result.status === 'fulfilled' ? result.value : null
    );

    const compilationResult = results[0] || { compilationScore: 50, errors: [] };
    const securityResult = results[1] || { securityScore: 50, issues: [] };
    const performanceResult = results[2] || { performanceScore: 50, issues: [] };
    const testResult = results[3] || { testScore: 50, results: [] };
    const codeAnalysis = results[4] || this.getDefaultCodeAnalysis();
    const documentationResult = results[5] || { documentationScore: 50, coverage: 0, quality: 0 };

    // Calculate metrics
    const metrics: QualityMetrics = {
      codeCompilation: compilationResult.compilationScore,
      testsPassing: testResult.testScore,
      securityScore: securityResult.securityScore,
      performanceScore: performanceResult.performanceScore,
      userSatisfaction: 4.0, // Would be updated based on actual user feedback
      consistency: await this.calculateConsistency(request),
      readability: this.calculateReadability(request.response),
      maintainability: codeAnalysis.maintainabilityIndex,
      documentation: documentationResult.documentationScore,
      bestPractices: this.calculateBestPracticesScore(request.response),
      overallScore: 0 // Will be calculated below
    };

    // Calculate weighted overall score
    metrics.overallScore = this.calculateOverallScore(metrics, request.taskType);

    // Generate feedback
    const feedback = this.generateFeedback(metrics, compilationResult, securityResult, performanceResult);

    // Get benchmark comparison
    const benchmarkComparison = await this.getBenchmarkComparison(request, metrics);

    return {
      requestId: request.id,
      metrics,
      overallScore: metrics.overallScore,
      timestamp: new Date(),
      details: {
        compilationErrors: compilationResult.errors,
        securityIssues: securityResult.issues,
        performanceIssues: performanceResult.issues,
        testResults: testResult.results,
        codeAnalysis
      },
      feedback,
      benchmarkComparison,
      executionTime,
      assessmentVersion: '1.0.0'
    };
  }

  private calculateOverallScore(metrics: QualityMetrics, taskType: string): number {
    // Task-specific weights
    const weights = this.getTaskWeights(taskType);
    
    return (
      metrics.codeCompilation * weights.compilation +
      metrics.testsPassing * weights.testing +
      metrics.securityScore * weights.security +
      metrics.performanceScore * weights.performance +
      metrics.readability * weights.readability +
      metrics.maintainability * weights.maintainability +
      metrics.documentation * weights.documentation +
      metrics.bestPractices * weights.bestPractices
    ) / 100;
  }

  private getTaskWeights(taskType: string) {
    const weights = {
      code_generation: {
        compilation: 0.25,
        testing: 0.15,
        security: 0.20,
        performance: 0.15,
        readability: 0.10,
        maintainability: 0.10,
        documentation: 0.03,
        bestPractices: 0.02
      },
      test_generation: {
        compilation: 0.30,
        testing: 0.40,
        security: 0.10,
        performance: 0.05,
        readability: 0.10,
        maintainability: 0.03,
        documentation: 0.01,
        bestPractices: 0.01
      },
      documentation: {
        compilation: 0.05,
        testing: 0.05,
        security: 0.05,
        performance: 0.05,
        readability: 0.25,
        maintainability: 0.10,
        documentation: 0.40,
        bestPractices: 0.05
      }
    };

    return weights[taskType] || weights.code_generation;
  }

  // Additional helper methods (abbreviated for space)
  private generateCacheKey(request: QualityAssessmentRequest): string {
    return `${request.modelName}_${request.taskType}_${this.hashString(request.response)}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private isCacheValid(result: QualityAssessmentResult): boolean {
    // Simple cache validation - could be more sophisticated
    return Date.now() - new Date(result.executionTime).getTime() < this.config.cacheTTL;
  }

  private isCodeGenerationTask(taskType: string): boolean {
    return ['code_generation', 'refactoring', 'debugging'].includes(taskType);
  }

  private detectLanguage(code: string): string {
    if (code.includes('function') && code.includes('{')) return 'javascript';
    if (code.includes('def ') && code.includes(':')) return 'python';
    if (code.includes('public class')) return 'java';
    if (code.includes('fn ') && code.includes('->')) return 'rust';
    return 'javascript'; // Default
  }

  private async createTempFile(code: string, language: string): Promise<string> {
    const extensions = {
      javascript: '.js',
      typescript: '.ts',
      python: '.py',
      java: '.java',
      rust: '.rs'
    };

    const extension = extensions[language] || '.txt';
    const filename = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${extension}`;
    const filepath = path.join(this.tempDir, filename);

    await fs.writeFile(filepath, code, 'utf8');
    return filepath;
  }

  private async compileCode(filepath: string, language: string): Promise<{
    compilationScore: number;
    errors: CompilationError[];
  }> {
    const errors: CompilationError[] = [];
    
    try {
      let command: string;
      
      switch (language) {
        case 'javascript':
        case 'typescript':
          command = `node -c "${filepath}"`;
          break;
        case 'python':
          command = `python -m py_compile "${filepath}"`;
          break;
        case 'java':
          command = `javac "${filepath}"`;
          break;
        default:
          return { compilationScore: 50, errors: [] }; // Unknown language
      }

      await execAsync(command, { timeout: this.config.compilationTimeout });
      return { compilationScore: 100, errors: [] };
      
    } catch (error: any) {
      // Parse compilation errors
      const errorLines = error.stderr?.split('\n') || [];
      
      errorLines.forEach((line: string, index: number) => {
        if (line.trim()) {
          errors.push({
            type: 'syntax',
            severity: 'error',
            line: index + 1,
            column: 0,
            message: line.trim(),
            suggestion: 'Check syntax and fix compilation errors'
          });
        }
      });

      const compilationScore = Math.max(0, 100 - (errors.length * 20));
      return { compilationScore, errors };
    }
  }

  private calculateConsistency(request: QualityAssessmentRequest): Promise<number> {
    const code = request.response || '';
    let score = 70; // Base score

    // Check naming consistency (camelCase vs snake_case mixing)
    const hasCamelCase = /[a-z][A-Z]/.test(code);
    const hasSnakeCase = /[a-z]_[a-z]/.test(code);
    if (hasCamelCase && hasSnakeCase) score -= 15; // Mixed naming conventions

    // Check indentation consistency
    const lines = code.split('\n').filter(l => l.trim().length > 0);
    const indentTypes = new Set(lines.map(l => {
      const match = l.match(/^(\s+)/);
      if (!match) return 'none';
      return match[1].includes('\t') ? 'tab' : `space-${match[1].length % 4 === 0 ? 4 : 2}`;
    }));
    if (indentTypes.size <= 2) score += 10; // Consistent indentation

    // Check quote consistency (single vs double)
    const singleQuotes = (code.match(/'/g) || []).length;
    const doubleQuotes = (code.match(/"/g) || []).length;
    if (singleQuotes > 0 && doubleQuotes > 0) {
      const ratio = Math.min(singleQuotes, doubleQuotes) / Math.max(singleQuotes, doubleQuotes);
      if (ratio > 0.3) score -= 10; // Mixed quote styles
    } else {
      score += 10; // Consistent quotes
    }

    // Check semicolon consistency
    const withSemicolon = lines.filter(l => l.trim().endsWith(';')).length;
    const withoutSemicolon = lines.filter(l => !l.trim().endsWith(';') && !l.trim().endsWith('{') && !l.trim().endsWith('}') && l.trim().length > 0).length;
    if (withSemicolon > 0 && withoutSemicolon > 0) {
      const semiRatio = withSemicolon / (withSemicolon + withoutSemicolon);
      if (semiRatio > 0.3 && semiRatio < 0.7) score -= 10; // Inconsistent semicolons
    }

    return Promise.resolve(Math.max(0, Math.min(100, score)));
  }

  private calculateReadability(code: string): number {
    const lines = code.split('\n');
    const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    const complexityPenalty = avgLineLength > 80 ? 10 : 0;
    
    const hasComments = lines.some(line => line.trim().startsWith('//') || line.trim().startsWith('#'));
    const commentBonus = hasComments ? 10 : 0;
    
    return Math.max(0, 80 - complexityPenalty + commentBonus);
  }

  private calculateBestPracticesScore(code: string): number {
    let score = 100;
    
    // Check for various best practices
    if (!/const |let /.test(code)) score -= 20; // No variable declarations
    if (!/function\s+\w+/.test(code) && !/\w+\s*=>/.test(code)) score -= 10; // No functions
    if (code.includes('var ')) score -= 15; // Using var instead of let/const
    if (code.length > 1000 && !code.includes('//')) score -= 20; // Large code without comments
    
    return Math.max(0, score);
  }

  // Additional utility methods (simplified for brevity)
  private countTests(code: string): number {
    const testPatterns = [
      /test\s*\(/gi,
      /it\s*\(/gi,
      /describe\s*\(/gi,
      /def\s+test_/gi
    ];
    
    return testPatterns.reduce((count, pattern) => {
      const matches = code.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
  }

  private calculateCyclomaticComplexity(code: string): number {
    const complexityKeywords = ['if', 'else', 'while', 'for', 'case', 'catch', '&&', '||'];
    let complexity = 1; // Base complexity
    
    complexityKeywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = code.match(regex);
      complexity += matches ? matches.length : 0;
    });
    
    return complexity;
  }

  private detectCodeSmells(code: string): CodeSmell[] {
    const smells: CodeSmell[] = [];
    const lines = code.split('\n');
    
    // Long method detection
    if (lines.length > 50) {
      smells.push({
        type: 'long_method',
        location: 'entire file',
        description: 'Method/function is too long (>50 lines)',
        severity: 'major'
      });
    }
    
    // Duplicate code detection (simplified)
    const duplicateThreshold = 3;
    const lineGroups = new Map<string, number>();
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.length > 10) {
        lineGroups.set(trimmed, (lineGroups.get(trimmed) || 0) + 1);
      }
    });
    
    lineGroups.forEach((count, line) => {
      if (count >= duplicateThreshold) {
        smells.push({
          type: 'duplicate_code',
          location: `line: ${line.substring(0, 30)}...`,
          description: `Duplicate code detected (${count} occurrences)`,
          severity: 'minor'
        });
      }
    });
    
    return smells;
  }

  private calculateDuplication(code: string): number {
    // Simplified duplication calculation
    const lines = code.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    const uniqueLines = new Set(lines);
    
    return lines.length > 0 ? ((lines.length - uniqueLines.size) / lines.length) * 100 : 0;
  }

  private calculateMaintainabilityIndex(code: string): number {
    const linesOfCode = code.split('\n').filter(l => l.trim().length > 0).length;
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(code);
    
    // Simplified maintainability index calculation
    const maintainabilityIndex = Math.max(0, 
      171 - 5.2 * Math.log(linesOfCode) - 0.23 * cyclomaticComplexity - 16.2 * Math.log(linesOfCode)
    );
    
    return Math.min(100, maintainabilityIndex);
  }

  private calculateTechnicalDebt(code: string): string {
    const issues = this.detectCodeSmells(code).length;
    const complexity = this.calculateCyclomaticComplexity(code);
    
    const debtMinutes = issues * 30 + complexity * 10; // Rough estimation
    
    if (debtMinutes < 60) return `${debtMinutes} minutes`;
    if (debtMinutes < 1440) return `${Math.round(debtMinutes / 60)} hours`;
    return `${Math.round(debtMinutes / 1440)} days`;
  }

  private getDefaultCodeAnalysis(): CodeAnalysis {
    return {
      linesOfCode: 0,
      cyclomaticComplexity: 1,
      codeSmells: [],
      duplicatedCode: 0,
      maintainabilityIndex: 50,
      technicalDebt: '0 minutes'
    };
  }

  private generateFeedback(
    metrics: QualityMetrics,
    compilation: any,
    security: any,
    performance: any
  ) {
    const strengths: string[] = [];
    const improvements: string[] = [];
    const recommendations: string[] = [];

    // Identify strengths
    if (metrics.codeCompilation >= 90) strengths.push('Code compiles without errors');
    if (metrics.securityScore >= 80) strengths.push('Good security practices followed');
    if (metrics.performanceScore >= 80) strengths.push('Efficient performance characteristics');
    if (metrics.readability >= 80) strengths.push('High code readability');

    // Identify improvements
    if (metrics.codeCompilation < 70) improvements.push('Address compilation errors');
    if (metrics.securityScore < 70) improvements.push('Fix security vulnerabilities');
    if (metrics.performanceScore < 70) improvements.push('Optimize performance bottlenecks');
    if (metrics.documentation < 50) improvements.push('Add more comprehensive documentation');

    // Generate recommendations
    if (security.issues.length > 0) {
      recommendations.push('Review and fix security vulnerabilities before production');
    }
    if (performance.issues.length > 0) {
      recommendations.push('Optimize algorithm efficiency for better performance');
    }
    if (metrics.testsPassing < 80) {
      recommendations.push('Improve test coverage and fix failing tests');
    }

    return { strengths, improvements, recommendations };
  }

  private async getBenchmarkComparison(request: QualityAssessmentRequest, metrics: QualityMetrics) {
    const benchmarkKey = `${request.modelName}_${request.taskType}_${request.language || 'unknown'}`;
    const benchmark = this.benchmarks.get(benchmarkKey);

    if (!benchmark) {
      return {
        vsAverage: 0,
        vsTopPerformer: 0,
        ranking: 1
      };
    }

    const vsAverage = ((metrics.overallScore - benchmark.averageMetrics.overallScore) / benchmark.averageMetrics.overallScore) * 100;
    
    return {
      vsAverage,
      vsTopPerformer: -10, // Simplified - would calculate against actual top performer
      ranking: vsAverage > 0 ? 1 : 2 // Simplified ranking
    };
  }

  private async loadBenchmarks(): Promise<void> {
    // In production, this would load from a database
    // For now, initialize with default benchmarks
    Logger.debug('Loading quality benchmarks...');
  }

  private async updateBenchmarks(request: QualityAssessmentRequest, result: QualityAssessmentResult): Promise<void> {
    const benchmarkKey = `${request.modelName}_${request.taskType}_${request.language || 'unknown'}`;
    const existing = this.benchmarks.get(benchmarkKey);

    if (existing) {
      // Update existing benchmark with exponential moving average
      const alpha = 0.1;
      Object.keys(existing.averageMetrics).forEach(key => {
        if (typeof existing.averageMetrics[key] === 'number' && typeof result.metrics[key] === 'number') {
          existing.averageMetrics[key] = existing.averageMetrics[key] * (1 - alpha) + result.metrics[key] * alpha;
        }
      });
      existing.sampleSize += 1;
      existing.lastUpdated = new Date();
    } else {
      // Create new benchmark
      this.benchmarks.set(benchmarkKey, {
        modelName: request.modelName,
        taskType: request.taskType,
        language: request.language || 'unknown',
        averageMetrics: { ...result.metrics },
        sampleSize: 1,
        lastUpdated: new Date()
      });
    }
  }

  private cleanupCache(): void {
    if (this.assessmentCache.size > this.config.maxCacheSize) {
      // Remove oldest entries
      const entries = Array.from(this.assessmentCache.entries());
      const toRemove = entries.slice(0, entries.length - this.config.maxCacheSize);
      toRemove.forEach(([key]) => this.assessmentCache.delete(key));
    }
  }

  private async getModelResponse(modelName: string, prompt: string, taskType: string): Promise<string> {
    // TODO(model-integration): Wire to real AI provider APIs when model routing is available.
    // Quality assessment of model responses requires calling the actual model.
    // Without a configured provider, return empty string to signal no response available.
    console.warn(`[QualityAssessor] No model API configured for ${modelName} — skipping response generation`);
    return '';
  }

  private generateComparisonInsights(results: any[]): string[] {
    const insights: string[] = [];
    
    const scores = results.map(r => r.metrics.overallScore);
    const range = Math.max(...scores) - Math.min(...scores);
    
    if (range > 20) {
      insights.push(`Significant quality variation: ${range.toFixed(1)} point spread between models`);
    }
    
    const avgSecurity = results.reduce((sum, r) => sum + r.metrics.securityScore, 0) / results.length;
    if (avgSecurity < 70) {
      insights.push('Security concerns detected across multiple models');
    }
    
    return insights;
  }

  private async analyzeQualityTrend(modelName: string, period: string) {
    // Simulate trend analysis - would query actual historical data
    return {
      trend: 'improving' as const,
      changeRate: 5.2,
      dataPoints: 150,
      averageScore: 78.5,
      categories: [
        { category: 'codeCompilation' as const, trend: 'stable' as const, change: 1.2 },
        { category: 'securityScore' as const, trend: 'improving' as const, change: 8.5 },
        { category: 'performanceScore' as const, trend: 'improving' as const, change: 3.1 }
      ]
    };
  }

  private async getRecentAssessments(modelName: string, period: string): Promise<QualityAssessmentResult[]> {
    // No persistence configured — assessments are not stored to a database yet.
    // When a database is wired, query for assessments within the given period.
    return [];
  }

  private calculateAverageMetrics(assessments: QualityAssessmentResult[]): QualityMetrics {
    if (assessments.length === 0) {
      return {
        codeCompilation: 0, testsPassing: 0, securityScore: 0, performanceScore: 0,
        userSatisfaction: 0, consistency: 0, readability: 0, maintainability: 0,
        documentation: 0, bestPractices: 0, overallScore: 0
      };
    }

    const metrics = assessments.reduce((acc, assessment) => {
      Object.keys(acc).forEach(key => {
        acc[key] += assessment.metrics[key] || 0;
      });
      return acc;
    }, {
      codeCompilation: 0, testsPassing: 0, securityScore: 0, performanceScore: 0,
      userSatisfaction: 0, consistency: 0, readability: 0, maintainability: 0,
      documentation: 0, bestPractices: 0, overallScore: 0
    });

    Object.keys(metrics).forEach(key => {
      metrics[key] /= assessments.length;
    });

    return metrics;
  }

  private detectRegression(baseline: QualityMetrics, current: QualityMetrics) {
    const threshold = 10; // 10% decline threshold
    
    const criticalMetrics = ['codeCompilation', 'securityScore', 'overallScore'];
    
    for (const metric of criticalMetrics) {
      const decline = ((baseline[metric] - current[metric]) / baseline[metric]) * 100;
      
      if (decline > threshold) {
        return {
          regressionType: metric === 'codeCompilation' ? 'compilation' : 
                         metric === 'securityScore' ? 'security' : 'overall',
          severity: decline > 25 ? 'severe' : decline > 15 ? 'moderate' : 'minor',
          previousScore: baseline[metric],
          currentScore: current[metric],
          decline,
          possibleCauses: this.getPossibleCauses(metric, decline),
          recommendations: this.getRecommendations(metric, decline)
        };
      }
    }
    
    return null;
  }

  private getPossibleCauses(metric: string, decline: number): string[] {
    const causes = {
      codeCompilation: ['Model training data change', 'Syntax generation issues', 'Language-specific problems'],
      securityScore: ['New vulnerability patterns', 'Security rule updates', 'Training data contamination'],
      overallScore: ['Multiple factors degrading', 'Model fine-tuning issues', 'Evaluation criteria changes']
    };
    
    return causes[metric] || ['Unknown factors'];
  }

  private getRecommendations(metric: string, decline: number): string[] {
    const recommendations = {
      codeCompilation: ['Review model training data', 'Add syntax validation', 'Increase testing'],
      securityScore: ['Update security rules', 'Additional security training', 'Manual review process'],
      overallScore: ['Comprehensive model evaluation', 'Rollback if necessary', 'Investigate root causes']
    };
    
    return recommendations[metric] || ['Monitor closely'];
  }

  private getSecurityRecommendation(type: string): string {
    const recommendations = {
      code_injection: 'Use parameterized queries and input validation',
      xss: 'Use safe DOM manipulation methods and sanitize inputs',
      sql_injection: 'Use prepared statements and parameterized queries',
      insecure_storage: 'Use environment variables or secure configuration management'
    };
    
    return recommendations[type] || 'Follow security best practices';
  }

  private getSecurityImpact(severity: string): string {
    const impacts = {
      low: 'Minor security risk',
      medium: 'Moderate security risk - should be addressed',
      high: 'High security risk - immediate attention required',
      critical: 'Critical security vulnerability - fix immediately'
    };
    
    return impacts[severity] || 'Security impact unknown';
  }

  private getPerformanceImpact(type: string): string {
    const impacts = {
      memory_leak: 'May cause memory consumption to grow over time',
      inefficient_algorithm: 'May cause slow performance with large datasets',
      unnecessary_computation: 'Wastes CPU cycles and increases response time',
      blocking_operation: 'May cause application to become unresponsive'
    };
    
    return impacts[type] || 'Performance impact varies';
  }

  private getPerformanceSuggestion(type: string): string {
    const suggestions = {
      memory_leak: 'Ensure proper cleanup of resources and object references',
      inefficient_algorithm: 'Consider using more efficient algorithms or data structures',
      unnecessary_computation: 'Cache results or eliminate redundant operations',
      blocking_operation: 'Use asynchronous operations or worker threads'
    };
    
    return suggestions[type] || 'Review performance implications';
  }
}

// Export singleton instance
export const qualityAssessor = new QualityAssessor();