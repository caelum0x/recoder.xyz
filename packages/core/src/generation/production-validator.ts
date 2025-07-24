/**
 * Production Code Validator for Recoder.xyz
 * 
 * Ensures all generated code is production-ready, not mock implementations
 */

import { EventEmitter } from 'events';
import * as ts from 'typescript';
import * as eslint from 'eslint';

export interface ValidationResult {
  isValid: boolean;
  quality: {
    score: number; // 0-1
    metrics: QualityMetrics;
  };
  issues: ValidationIssue[];
  suggestions: CodeSuggestion[];
  productionReadiness: {
    isReady: boolean;
    blockers: string[];
    warnings: string[];
    checklist: ProductionChecklist;
  };
}

export interface QualityMetrics {
  syntaxCorrectness: number;
  typesSafety: number;
  securityCompliance: number;
  performanceScore: number;
  maintainabilityIndex: number;
  testCoverage: number;
  documentationScore: number;
  realImplementationScore: number; // Key metric - no mocks
}

export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  category: 'syntax' | 'types' | 'security' | 'performance' | 'maintainability' | 'mock-detection';
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface CodeSuggestion {
  type: 'improvement' | 'security' | 'performance' | 'real-implementation';
  description: string;
  before: string;
  after: string;
  benefit: string;
}

export interface ProductionChecklist {
  hasRealImplementations: boolean;
  hasErrorHandling: boolean;
  hasInputValidation: boolean;
  hasSecurityMeasures: boolean;
  hasLogging: boolean;
  hasTests: boolean;
  hasDocumentation: boolean;
  hasTypeDefinitions: boolean;
  hasEnvironmentConfig: boolean;
  hasDeploymentConfig: boolean;
}

export interface ValidationConfig {
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'solidity';
  framework?: string;
  strictMode: boolean;
  productionFocus: boolean;
  securityLevel: 'basic' | 'standard' | 'strict' | 'enterprise';
  performanceThreshold: number;
  mockDetectionEnabled: boolean;
  realCodeEnforcement: boolean;
}

export class ProductionValidator extends EventEmitter {
  private static instance: ProductionValidator;
  private config: ValidationConfig;
  private mockPatterns: Map<string, RegExp[]> = new Map();
  private realImplementationPatterns: Map<string, RegExp[]> = new Map();

  private constructor(config: ValidationConfig) {
    super();
    this.config = config;
    this.initializeMockDetectionPatterns();
    this.initializeRealImplementationPatterns();
  }

  static getInstance(config?: ValidationConfig): ProductionValidator {
    if (!ProductionValidator.instance) {
      if (!config) {
        throw new Error('Configuration required for initial ProductionValidator setup');
      }
      ProductionValidator.instance = new ProductionValidator(config);
    }
    return ProductionValidator.instance;
  }

  /**
   * Validate generated code for production readiness
   */
  async validateCode(code: string, metadata?: {
    filename?: string;
    context?: string;
    taskType?: string;
  }): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      // Initial syntax and type checking
      const syntaxResult = await this.validateSyntax(code);
      const typesResult = await this.validateTypes(code);
      
      // Mock detection (critical for Recoder.xyz)
      const mockDetectionResult = await this.detectMockImplementations(code);
      
      // Security analysis
      const securityResult = await this.validateSecurity(code);
      
      // Performance analysis
      const performanceResult = await this.validatePerformance(code);
      
      // Production readiness check
      const productionChecklist = await this.checkProductionReadiness(code);
      
      // Calculate quality metrics
      const qualityMetrics = this.calculateQualityMetrics({
        syntaxResult,
        typesResult,
        mockDetectionResult,
        securityResult,
        performanceResult,
        productionChecklist
      });

      // Aggregate all issues
      const allIssues = [
        ...syntaxResult.issues,
        ...typesResult.issues,
        ...mockDetectionResult.issues,
        ...securityResult.issues,
        ...performanceResult.issues
      ];

      // Generate suggestions
      const suggestions = await this.generateSuggestions(code, allIssues);

      // Determine overall validity
      const criticalIssues = allIssues.filter(issue => issue.severity === 'critical');
      const isValid = criticalIssues.length === 0 && qualityMetrics.realImplementationScore > 0.8;

      const result: ValidationResult = {
        isValid,
        quality: {
          score: this.calculateOverallScore(qualityMetrics),
          metrics: qualityMetrics
        },
        issues: allIssues,
        suggestions,
        productionReadiness: {
          isReady: isValid && productionChecklist.hasRealImplementations,
          blockers: this.getProductionBlockers(allIssues, productionChecklist),
          warnings: this.getProductionWarnings(allIssues),
          checklist: productionChecklist
        }
      };

      // Emit validation event
      this.emit('validation:completed', {
        result,
        duration: Date.now() - startTime,
        metadata
      });

      return result;

    } catch (error) {
      this.emit('validation:error', { error, metadata });
      throw new Error(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect mock implementations (critical for Recoder.xyz)
   */
  private async detectMockImplementations(code: string): Promise<{
    issues: ValidationIssue[];
    score: number;
  }> {
    const issues: ValidationIssue[] = [];
    let realImplementationScore = 1.0;

    const language = this.config.language;
    const mockPatterns = this.mockPatterns.get(language) || [];

    for (const pattern of mockPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        for (const match of matches) {
          issues.push({
            type: 'error',
            category: 'mock-detection',
            message: `Mock implementation detected: "${match}". Recoder.xyz generates real, production-ready code only.`,
            severity: 'critical',
            suggestion: this.getMockReplacementSuggestion(match)
          });
          realImplementationScore -= 0.2;
        }
      }
    }

    // Check for real implementation patterns
    const realPatterns = this.realImplementationPatterns.get(language) || [];
    let realPatternMatches = 0;

    for (const pattern of realPatterns) {
      if (pattern.test(code)) {
        realPatternMatches++;
      }
    }

    // Boost score for real implementations
    if (realPatternMatches > 0) {
      realImplementationScore += Math.min(0.2 * realPatternMatches, 0.5);
    }

    return {
      issues,
      score: Math.max(0, Math.min(1, realImplementationScore))
    };
  }

  /**
   * Validate syntax and basic structure
   */
  private async validateSyntax(code: string): Promise<{
    issues: ValidationIssue[];
    score: number;
  }> {
    const issues: ValidationIssue[] = [];

    try {
      if (this.config.language === 'typescript' || this.config.language === 'javascript') {
        // Use TypeScript compiler for syntax checking
        const result = ts.transpileModule(code, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ESNext,
            strict: this.config.strictMode,
            noEmitOnError: true
          },
          reportDiagnostics: true
        });

        if (result.diagnostics && result.diagnostics.length > 0) {
          for (const diagnostic of result.diagnostics) {
            const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
            const line = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start || 0).line;
            const column = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start || 0).character;

            issues.push({
              type: 'error',
              category: 'syntax',
              message,
              line,
              column,
              severity: 'high'
            });
          }
        }
      }

      return {
        issues,
        score: issues.length === 0 ? 1.0 : Math.max(0, 1 - (issues.length * 0.1))
      };

    } catch (error) {
      issues.push({
        type: 'error',
        category: 'syntax',
        message: `Syntax validation failed: ${error}`,
        severity: 'critical'
      });

      return { issues, score: 0 };
    }
  }

  /**
   * Validate TypeScript types and interfaces
   */
  private async validateTypes(code: string): Promise<{
    issues: ValidationIssue[];
    score: number;
  }> {
    const issues: ValidationIssue[] = [];

    if (this.config.language !== 'typescript') {
      return { issues, score: 0.5 }; // Neutral score for non-TS
    }

    try {
      // Create TypeScript program for type checking
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        code,
        ts.ScriptTarget.ES2020,
        true
      );

      // Basic type analysis
      let typeScore = 0.8;

      // Check for proper type annotations
      const hasTypeAnnotations = this.checkTypeAnnotations(sourceFile);
      if (!hasTypeAnnotations) {
        issues.push({
          type: 'warning',
          category: 'types',
          message: 'Consider adding explicit type annotations for better type safety',
          severity: 'medium',
          suggestion: 'Add type annotations to function parameters and return types'
        });
        typeScore -= 0.1;
      }

      // Check for 'any' types
      const hasAnyTypes = code.includes(': any') || code.includes('as any');
      if (hasAnyTypes) {
        issues.push({
          type: 'warning',
          category: 'types',
          message: 'Avoid using "any" type for better type safety',
          severity: 'medium',
          suggestion: 'Use specific types or interfaces instead of "any"'
        });
        typeScore -= 0.2;
      }

      return { issues, score: Math.max(0, Math.min(1, typeScore)) };

    } catch (error) {
      issues.push({
        type: 'error',
        category: 'types',
        message: `Type validation failed: ${error}`,
        severity: 'high'
      });

      return { issues, score: 0 };
    }
  }

  /**
   * Validate security aspects
   */
  private async validateSecurity(code: string): Promise<{
    issues: ValidationIssue[];
    score: number;
  }> {
    const issues: ValidationIssue[] = [];
    let securityScore = 1.0;

    // Common security anti-patterns
    const securityChecks = [
      {
        pattern: /eval\s*\(/g,
        message: 'Avoid using eval() - security risk',
        severity: 'critical' as const,
        impact: 0.3
      },
      {
        pattern: /innerHTML\s*=/g,
        message: 'Be careful with innerHTML - potential XSS risk',
        severity: 'high' as const,
        impact: 0.2
      },
      {
        pattern: /document\.write\s*\(/g,
        message: 'Avoid document.write() - security and performance issues',
        severity: 'high' as const,
        impact: 0.2
      },
      {
        pattern: /password.*=.*['"]\w+['"]/gi,
        message: 'Hardcoded passwords detected - use environment variables',
        severity: 'critical' as const,
        impact: 0.4
      },
      {
        pattern: /api[_-]?key.*=.*['"]\w+['"]/gi,
        message: 'Hardcoded API keys detected - use environment variables',
        severity: 'critical' as const,
        impact: 0.4
      }
    ];

    for (const check of securityChecks) {
      const matches = code.match(check.pattern);
      if (matches) {
        issues.push({
          type: 'error',
          category: 'security',
          message: check.message,
          severity: check.severity,
          suggestion: 'Use secure alternatives and environment variables for secrets'
        });
        securityScore -= check.impact;
      }
    }

    // Check for input validation
    const hasInputValidation = /validate|sanitize|escape/i.test(code);
    if (!hasInputValidation && code.includes('req.body')) {
      issues.push({
        type: 'warning',
        category: 'security',
        message: 'Add input validation for API endpoints',
        severity: 'medium',
        suggestion: 'Use validation libraries like Joi, Yup, or Zod'
      });
      securityScore -= 0.1;
    }

    return {
      issues,
      score: Math.max(0, Math.min(1, securityScore))
    };
  }

  /**
   * Validate performance aspects
   */
  private async validatePerformance(code: string): Promise<{
    issues: ValidationIssue[];
    score: number;
  }> {
    const issues: ValidationIssue[] = [];
    let performanceScore = 0.8;

    // Performance anti-patterns
    const performanceChecks = [
      {
        pattern: /for\s*\([^)]*\)\s*\{[^}]*for\s*\([^)]*\)\s*\{[^}]*for\s*\(/g,
        message: 'Avoid nested loops - O(n³) complexity',
        severity: 'high' as const,
        impact: 0.3
      },
      {
        pattern: /\.forEach\s*\([^)]*\)\s*[^.]*\.forEach/g,
        message: 'Consider optimizing nested iterations',
        severity: 'medium' as const,
        impact: 0.1
      },
      {
        pattern: /console\.log/g,
        message: 'Remove console.log statements in production code',
        severity: 'low' as const,
        impact: 0.05
      }
    ];

    for (const check of performanceChecks) {
      const matches = code.match(check.pattern);
      if (matches) {
        issues.push({
          type: 'warning',
          category: 'performance',
          message: check.message,
          severity: check.severity,
          suggestion: 'Consider algorithmic improvements or caching'
        });
        performanceScore -= check.impact;
      }
    }

    // Check for async/await best practices
    if (code.includes('async') && !code.includes('await')) {
      issues.push({
        type: 'warning',
        category: 'performance',
        message: 'Async function without await - consider if async is needed',
        severity: 'low',
        suggestion: 'Remove async if not using await, or add proper await usage'
      });
    }

    return {
      issues,
      score: Math.max(0, Math.min(1, performanceScore))
    };
  }

  /**
   * Check production readiness
   */
  private async checkProductionReadiness(code: string): Promise<ProductionChecklist> {
    return {
      hasRealImplementations: this.checkRealImplementations(code),
      hasErrorHandling: /try\s*\{|catch\s*\(|\.catch\(/.test(code),
      hasInputValidation: /validate|sanitize|joi|yup|zod/i.test(code),
      hasSecurityMeasures: /helmet|cors|rate.*limit|auth/i.test(code),
      hasLogging: /logger|log\.|winston|pino/i.test(code),
      hasTests: /test|spec|jest|mocha|chai/i.test(code),
      hasDocumentation: /\/\*\*|@param|@returns|@example/.test(code),
      hasTypeDefinitions: this.config.language === 'typescript' || /.d.ts/.test(code),
      hasEnvironmentConfig: /process\.env|config|dotenv/.test(code),
      hasDeploymentConfig: /dockerfile|docker|k8s|kubernetes|deploy/.test(code.toLowerCase())
    };
  }

  /**
   * Initialize mock detection patterns
   */
  private initializeMockDetectionPatterns(): void {
    // TypeScript/JavaScript patterns
    this.mockPatterns.set('typescript', [
      /\/\/\s*TODO:?\s*implement/gi,
      /\/\/\s*FIXME:?\s*implement/gi,
      /throw\s+new\s+Error\s*\(\s*['"](not implemented|todo|fixme)/gi,
      /return\s+null;\s*\/\/\s*(placeholder|todo|mock)/gi,
      /return\s+undefined;\s*\/\/\s*(placeholder|todo|mock)/gi,
      /\/\*\s*(mock|placeholder|todo).*?\*\//gi,
      /console\.log\s*\(\s*['"]mock|placeholder['"][^)]*\)/gi,
      /\.mockReturnValue\(/gi,
      /\.mockImplementation\(/gi,
      /jest\.mock\(/gi,
      /sinon\.stub\(/gi,
      /return\s+\{\s*\};\s*\/\/\s*empty/gi
    ]);

    // Python patterns
    this.mockPatterns.set('python', [
      /#\s*TODO:?\s*implement/gi,
      /#\s*FIXME:?\s*implement/gi,
      /raise\s+NotImplementedError/gi,
      /pass\s*#\s*(placeholder|todo|mock)/gi,
      /return\s+None\s*#\s*(placeholder|todo|mock)/gi,
      /mock\.Mock\(/gi,
      /unittest\.mock/gi,
      /@patch/gi
    ]);

    // Solidity patterns
    this.mockPatterns.set('solidity', [
      /\/\/\s*TODO:?\s*implement/gi,
      /revert\s*\(\s*['"](not implemented|todo)/gi,
      /\/\*\s*(mock|placeholder|todo).*?\*\//gi
    ]);
  }

  /**
   * Initialize real implementation patterns
   */
  private initializeRealImplementationPatterns(): void {
    // TypeScript/JavaScript real patterns
    this.realImplementationPatterns.set('typescript', [
      /import.*from\s+['"][^'"]+['"]/g, // Real imports
      /async\s+function\s+\w+.*\{[\s\S]*await/g, // Real async implementations
      /\.then\s*\(|\.catch\s*\(/g, // Promise handling
      /new\s+\w+\s*\(/g, // Object instantiation
      /\w+\.\w+\s*\(/g, // Method calls
      /if\s*\([^)]+\)\s*\{[\s\S]*\}/g, // Conditional logic
      /for\s*\([^)]*\)\s*\{[\s\S]*\}/g, // Loops
      /switch\s*\([^)]*\)\s*\{[\s\S]*case/g, // Switch statements
      /class\s+\w+[\s\S]*constructor/g // Class definitions
    ]);

    // Python real patterns
    this.realImplementationPatterns.set('python', [
      /import\s+\w+|from\s+\w+\s+import/g,
      /def\s+\w+\s*\([^)]*\):\s*\n\s*[^#\n]/g,
      /class\s+\w+[\s\S]*def\s+__init__/g,
      /if\s+__name__\s*==\s*['"']__main__['"']/g,
      /with\s+open\s*\(/g,
      /try:\s*\n[\s\S]*except/g
    ]);
  }

  /**
   * Check for real implementations vs mocks
   */
  private checkRealImplementations(code: string): boolean {
    const language = this.config.language;
    const realPatterns = this.realImplementationPatterns.get(language) || [];
    const mockPatterns = this.mockPatterns.get(language) || [];

    let realCount = 0;
    let mockCount = 0;

    // Count real implementation patterns
    for (const pattern of realPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        realCount += matches.length;
      }
    }

    // Count mock patterns
    for (const pattern of mockPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        mockCount += matches.length;
      }
    }

    // Real implementations should significantly outweigh mocks
    return realCount > mockCount * 3 && mockCount === 0;
  }

  /**
   * Generate improvement suggestions
   */
  private async generateSuggestions(code: string, issues: ValidationIssue[]): Promise<CodeSuggestion[]> {
    const suggestions: CodeSuggestion[] = [];

    // Mock replacement suggestions
    const mockIssues = issues.filter(issue => issue.category === 'mock-detection');
    for (const issue of mockIssues) {
      suggestions.push({
        type: 'real-implementation',
        description: 'Replace mock implementation with real, working code',
        before: issue.message.match(/"([^"]+)"/)?.[1] || 'mock code',
        after: 'Real implementation with proper logic, error handling, and validation',
        benefit: 'Production-ready code that actually works'
      });
    }

    // Security suggestions
    const securityIssues = issues.filter(issue => issue.category === 'security');
    for (const issue of securityIssues) {
      if (issue.message.includes('hardcoded')) {
        suggestions.push({
          type: 'security',
          description: 'Use environment variables for secrets',
          before: 'const apiKey = "sk-123..."',
          after: 'const apiKey = process.env.API_KEY',
          benefit: 'Secure configuration management'
        });
      }
    }

    // Performance suggestions
    const performanceIssues = issues.filter(issue => issue.category === 'performance');
    for (const issue of performanceIssues) {
      if (issue.message.includes('nested loops')) {
        suggestions.push({
          type: 'performance',
          description: 'Optimize nested loops with better algorithms',
          before: 'O(n³) nested loops',
          after: 'O(n log n) sorting or O(n) hash table lookup',
          benefit: 'Significantly improved performance'
        });
      }
    }

    return suggestions;
  }

  /**
   * Calculate quality metrics
   */
  private calculateQualityMetrics(results: any): QualityMetrics {
    return {
      syntaxCorrectness: results.syntaxResult.score,
      typesSafety: results.typesResult.score,
      securityCompliance: results.securityResult.score,
      performanceScore: results.performanceResult.score,
      maintainabilityIndex: this.calculateMaintainabilityIndex(results),
      testCoverage: results.productionChecklist.hasTests ? 0.8 : 0.2,
      documentationScore: results.productionChecklist.hasDocumentation ? 0.9 : 0.3,
      realImplementationScore: results.mockDetectionResult.score
    };
  }

  /**
   * Calculate overall quality score
   */
  private calculateOverallScore(metrics: QualityMetrics): number {
    const weights = {
      syntaxCorrectness: 0.15,
      typesSafety: 0.10,
      securityCompliance: 0.20,
      performanceScore: 0.15,
      maintainabilityIndex: 0.10,
      testCoverage: 0.10,
      documentationScore: 0.05,
      realImplementationScore: 0.15 // Critical for Recoder.xyz
    };

    let totalScore = 0;
    for (const [metric, weight] of Object.entries(weights)) {
      totalScore += (metrics as any)[metric] * weight;
    }

    return Math.max(0, Math.min(1, totalScore));
  }

  /**
   * Get production blockers
   */
  private getProductionBlockers(issues: ValidationIssue[], checklist: ProductionChecklist): string[] {
    const blockers: string[] = [];

    // Critical issues
    const criticalIssues = issues.filter(issue => issue.severity === 'critical');
    for (const issue of criticalIssues) {
      blockers.push(issue.message);
    }

    // Missing essential production features
    if (!checklist.hasRealImplementations) {
      blockers.push('Contains mock implementations - replace with real, working code');
    }

    if (!checklist.hasErrorHandling) {
      blockers.push('Missing error handling - add try/catch blocks and proper error responses');
    }

    if (!checklist.hasInputValidation) {
      blockers.push('Missing input validation - validate all user inputs');
    }

    return blockers;
  }

  /**
   * Get production warnings
   */
  private getProductionWarnings(issues: ValidationIssue[]): string[] {
    return issues
      .filter(issue => issue.severity === 'high' || issue.severity === 'medium')
      .map(issue => issue.message);
  }

  // Helper methods
  private checkTypeAnnotations(sourceFile: ts.SourceFile): boolean {
    let hasAnnotations = false;
    
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        if (node.type || (node.parameters && node.parameters.some(p => p.type))) {
          hasAnnotations = true;
        }
      }
      ts.forEachChild(node, visit);
    };
    
    visit(sourceFile);
    return hasAnnotations;
  }

  private calculateMaintainabilityIndex(results: any): number {
    // Simplified maintainability calculation
    let score = 0.8;
    
    if (results.productionChecklist.hasDocumentation) score += 0.1;
    if (results.productionChecklist.hasTypeDefinitions) score += 0.1;
    if (results.typesResult.score > 0.8) score += 0.1;
    
    return Math.min(1.0, score);
  }

  private getMockReplacementSuggestion(mockCode: string): string {
    const suggestions: { [key: string]: string } = {
      'TODO: implement': 'Implement actual business logic with proper validation and error handling',
      'throw new Error': 'Replace with real implementation that handles the use case',
      'return null': 'Return actual computed value or meaningful response',
      'console.log': 'Use proper logging library and implement real functionality',
      'mockReturnValue': 'Replace with actual service implementation',
      'jest.mock': 'Use real services and dependencies'
    };

    for (const [pattern, suggestion] of Object.entries(suggestions)) {
      if (mockCode.toLowerCase().includes(pattern.toLowerCase())) {
        return suggestion;
      }
    }

    return 'Replace with real, production-ready implementation';
  }
}

export default ProductionValidator;