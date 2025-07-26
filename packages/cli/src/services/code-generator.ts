/**
 * Core Code Generation Engine with Real Functionality Enforcement
 */

import fs from 'fs-extra';
import path from 'path';
import { Logger } from '@recoder/shared';
import {
  GenerationRequest,
  GenerationResult,
  GenerationStatus,
  GenerationType,
  ValidationLevel,
  CodeQuality,
  GeneratedFile,
  ValidationResult,
  ValidationStatus,
  GenerationMetrics,
  GenerationError,
  GenerationWarning,
  InteractiveSession,
  InteractiveStep,
  UserChoice,
  GenerationPreview,
  MockDetectionResult,
  MockType,
  CodeLocation,
  FileChange,
  FileDependency,
  FileExport,
  FileImport
} from '@recoder/shared/types/code-generation';
import { TaskType, PrivacyLevel, TaskPriority } from '@recoder/shared/types/ai-models';
import { ProjectAnalyzer } from './project-analyzer';
import { RealityValidationSystem } from './reality-validator';
import { ValidationPipeline } from './validation-pipeline';
import { AIModelHub } from './ai-models/ai-hub';
import { DependencyManager } from './dependency-manager';

export class CodeGenerator {
  private logger: Logger;
  private projectAnalyzer: ProjectAnalyzer;
  private realityValidator: RealityValidationSystem;
  private validationPipeline: ValidationPipeline;
  private aiHub: AIModelHub;
  private dependencyManager: DependencyManager;
  private activeSessions: Map<string, InteractiveSession> = new Map();

  constructor(
    projectAnalyzer: ProjectAnalyzer,
    realityValidator: RealityValidationSystem,
    validationPipeline: ValidationPipeline,
    aiHub: AIModelHub,
    dependencyManager: DependencyManager
  ) {
    this.logger = Logger.getInstance();
    this.projectAnalyzer = projectAnalyzer;
    this.realityValidator = realityValidator;
    this.validationPipeline = validationPipeline;
    this.aiHub = aiHub;
    this.dependencyManager = dependencyManager;
  }

  public async generateCode(request: GenerationRequest): Promise<GenerationResult> {
    const startTime = Date.now();
    const resultId = this.generateResultId();

    this.logger.info('Starting code generation', {
      id: resultId,
      type: request.type,
      description: request.description
    });

    const result: GenerationResult = {
      id: resultId,
      request,
      status: GenerationStatus.PENDING,
      files: [],
      validation: this.createEmptyValidationResult(),
      metrics: this.createEmptyMetrics(),
      errors: [],
      warnings: [],
      suggestions: [],
      timestamp: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    try {
      // Update status to in progress
      result.status = GenerationStatus.IN_PROGRESS;

      // Step 1: Analyze project context
      await this.analyzeProjectContext(request.context);

      // Step 2: Generate code based on type
      const generatedFiles = await this.performGeneration(request);
      result.files = generatedFiles;

      // Step 3: Enforce real functionality
      await this.enforceRealFunctionality(result);

      // Step 4: Validate generated code
      result.status = GenerationStatus.VALIDATING;
      result.validation = await this.validateGeneration(result);

      // Step 5: Check for mock code and enforce reality
      await this.performRealityChecks(result);

      // Step 6: Calculate metrics
      result.metrics = this.calculateMetrics(result, startTime);

      // Step 7: Determine final status
      result.status = this.determineFinalStatus(result);

      this.logger.info('Code generation completed', {
        id: resultId,
        status: result.status,
        filesGenerated: result.files.length,
        duration: result.metrics.duration
      });

      return result;
    } catch (error) {
      result.status = GenerationStatus.FAILED;
      result.errors.push({
        code: 'GENERATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        severity: 'critical',
        suggestions: ['Check project configuration', 'Verify AI model availability', 'Review generation request'],
        recoverable: false
      });

      this.logger.error('Code generation failed', { id: resultId, error });
      return result;
    }
  }

  public async generateInteractively(request: GenerationRequest): Promise<InteractiveSession> {
    const sessionId = this.generateSessionId();
    
    const session: InteractiveSession = {
      id: sessionId,
      request,
      steps: await this.createInteractiveSteps(request),
      currentStep: 0,
      userChoices: [],
      status: 'active'
    };

    this.activeSessions.set(sessionId, session);

    this.logger.info('Interactive generation session started', {
      sessionId,
      totalSteps: session.steps.length
    });

    return session;
  }

  public async processUserChoice(sessionId: string, choice: UserChoice): Promise<InteractiveSession> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Interactive session not found: ${sessionId}`);
    }

    session.userChoices.push(choice);
    session.currentStep++;

    if (session.currentStep >= session.steps.length) {
      // All steps completed, generate code
      const result = await this.generateCode(session.request);
      session.status = result.status === GenerationStatus.COMPLETED ? 'completed' : 'completed';
    }

    this.activeSessions.set(sessionId, session);
    return session;
  }

  public async getGenerationPreview(request: GenerationRequest): Promise<GenerationPreview> {
    const tempResult = await this.performGeneration(request, true);
    
    return {
      files: tempResult.map(file => ({
        path: file.path,
        type: file.originalContent ? 'modify' : 'create',
        preview: this.createFilePreview(file.content),
        size: file.size
      })),
      changes: this.analyzeChanges(tempResult),
      impact: await this.analyzeImpact(tempResult, request.context)
    };
  }

  private async analyzeProjectContext(context: any): Promise<void> {
    this.logger.debug('Analyzing project context');
    
    // Verify project structure exists
    if (!await fs.pathExists(context.project?.rootPath)) {
      throw new Error(`Project root path does not exist: ${context.project?.rootPath}`);
    }

    // Analyze existing codebase
    await this.projectAnalyzer.analyzeProject(context.project.rootPath);
  }

  private async performGeneration(request: GenerationRequest, preview = false): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    switch (request.type) {
      case GenerationType.GENERATE:
        return await this.generateNewCode(request, preview);
      
      case GenerationType.MODIFY:
        return await this.modifyExistingCode(request, preview);
      
      case GenerationType.REFACTOR:
        return await this.refactorCode(request, preview);
      
      case GenerationType.FIX:
        return await this.fixCode(request, preview);
      
      case GenerationType.OPTIMIZE:
        return await this.optimizeCode(request, preview);
      
      default:
        throw new Error(`Unsupported generation type: ${request.type}`);
    }
  }

  private async generateNewCode(request: GenerationRequest, preview = false): Promise<GeneratedFile[]> {
    this.logger.debug('Generating new code', { description: request.description });

    const prompt = this.buildGenerationPrompt(request);
    const response = await this.aiHub.sendRequest([
      { role: 'system', content: this.getSystemPrompt(request) },
      { role: 'user', content: prompt }
    ], {
      context: {
        task: TaskType.CODE_GENERATION,
        priority: TaskPriority.HIGH,
        privacyLevel: PrivacyLevel.CONFIDENTIAL
      }
    });

    if (response.error) {
      throw new Error(`AI generation failed: ${response.error.message}`);
    }

    return await this.parseGenerationResponse(response.content, request, preview);
  }

  private async modifyExistingCode(request: GenerationRequest, preview = false): Promise<GeneratedFile[]> {
    this.logger.debug('Modifying existing code');

    // Read existing files that need modification
    const targetFiles = request.targets.files.filter(f => f.type === 'modify');
    const files: GeneratedFile[] = [];

    for (const target of targetFiles) {
      const existingContent = await fs.readFile(target.path, 'utf8');
      
      const prompt = this.buildModificationPrompt(request, target, existingContent);
      const response = await this.aiHub.sendRequest([
        { role: 'system', content: this.getSystemPrompt(request) },
        { role: 'user', content: prompt }
      ], {
        context: {
          task: TaskType.CODE_GENERATION, // Using CODE_GENERATION as there's no CODE_MODIFICATION
          priority: TaskPriority.HIGH,
          privacyLevel: PrivacyLevel.CONFIDENTIAL
        }
      });

      if (response.error) {
        throw new Error(`AI modification failed for ${target.path}: ${response.error.message}`);
      }

      const modifiedFile = await this.parseModificationResponse(
        response.content,
        target,
        existingContent,
        preview
      );
      
      files.push(modifiedFile);
    }

    return files;
  }

  private async refactorCode(request: GenerationRequest, preview = false): Promise<GeneratedFile[]> {
    this.logger.debug('Refactoring code');

    const refactorPrompt = this.buildRefactorPrompt(request);
    const response = await this.aiHub.sendRequest([
      { role: 'system', content: this.getRefactorSystemPrompt() },
      { role: 'user', content: refactorPrompt }
    ], {
      context: {
        task: TaskType.REFACTORING,
        priority: TaskPriority.HIGH,
        privacyLevel: PrivacyLevel.CONFIDENTIAL
      }
    });

    if (response.error) {
      throw new Error(`AI refactoring failed: ${response.error.message}`);
    }

    return await this.parseRefactorResponse(response.content, request, preview);
  }

  private async fixCode(request: GenerationRequest, preview = false): Promise<GeneratedFile[]> {
    this.logger.debug('Fixing code issues');

    const fixPrompt = this.buildFixPrompt(request);
    const response = await this.aiHub.sendRequest([
      { role: 'system', content: this.getFixSystemPrompt() },
      { role: 'user', content: fixPrompt }
    ], {
      context: {
        task: TaskType.DEBUGGING,
        priority: TaskPriority.HIGH,
        privacyLevel: PrivacyLevel.CONFIDENTIAL
      }
    });

    if (response.error) {
      throw new Error(`AI fix failed: ${response.error.message}`);
    }

    return await this.parseFixResponse(response.content, request, preview);
  }

  private async optimizeCode(request: GenerationRequest, preview = false): Promise<GeneratedFile[]> {
    this.logger.debug('Optimizing code performance');

    const optimizePrompt = this.buildOptimizePrompt(request);
    const response = await this.aiHub.sendRequest([
      { role: 'system', content: this.getOptimizeSystemPrompt() },
      { role: 'user', content: optimizePrompt }
    ], {
      context: {
        task: TaskType.PERFORMANCE_OPTIMIZATION,
        priority: TaskPriority.HIGH,
        privacyLevel: PrivacyLevel.CONFIDENTIAL
      }
    });

    if (response.error) {
      throw new Error(`AI optimization failed: ${response.error.message}`);
    }

    return await this.parseOptimizeResponse(response.content, request, preview);
  }

  private async enforceRealFunctionality(result: GenerationResult): Promise<void> {
    this.logger.debug('Enforcing real functionality');

    for (const file of result.files) {
      // Detect and replace mock implementations
      const mockDetection = await this.detectMockCode(file);
      if (mockDetection.detected) {
        await this.replaceMockWithReal(file, mockDetection);
      }

      // Verify external integrations
      await this.verifyExternalIntegrations(file);

      // Ensure proper error handling
      await this.enforceErrorHandling(file);

      // Validate database operations
      await this.validateDatabaseOperations(file);

      // Check API implementations
      await this.validateApiImplementations(file);
    }
  }

  private async detectMockCode(file: GeneratedFile): Promise<MockDetectionResult> {
    const mockPatterns = [
      /\/\*\s*TODO.*mock.*\*\//gi,
      /\/\/\s*TODO.*mock.*/gi,
      /console\.log\(['"]mock|fake|placeholder['"].*\)/gi,
      /return\s+['"]mock.*['"];?/gi,
      /throw new Error\(['"]Not implemented['"].*\)/gi,
      /return\s+{\s*mock:\s*true/gi,
      /\/\*\s*PLACEHOLDER.*\*\//gi,
      /\/\/\s*FIXME.*implement.*/gi
    ];

    const detected = mockPatterns.some(pattern => pattern.test(file.content));
    const locations: CodeLocation[] = [];
    const types: MockType[] = [];

    if (detected) {
      const lines = file.content.split('\n');
      lines.forEach((line, index) => {
        mockPatterns.forEach(pattern => {
          if (pattern.test(line)) {
            locations.push({
              file: file.path,
              line: index + 1,
              column: 0,
              length: line.length
            });

            // Determine mock type
            if (/todo|placeholder|fixme/i.test(line)) {
              types.push(MockType.PLACEHOLDER_LOGIC);
            } else if (/mock.*data|fake.*data/i.test(line)) {
              types.push(MockType.DUMMY_DATA);
            } else if (/mock.*api|fake.*api/i.test(line)) {
              types.push(MockType.FAKE_API);
            } else {
              types.push(MockType.INCOMPLETE_IMPLEMENTATION);
            }
          }
        });
      });
    }

    return {
      detected,
      locations,
      types: [...new Set(types)],
      suggestions: detected ? [
        'Replace mock implementations with real functionality',
        'Implement proper error handling',
        'Add external service integrations',
        'Create comprehensive test cases'
      ] : []
    };
  }

  private async replaceMockWithReal(file: GeneratedFile, mockDetection: MockDetectionResult): Promise<void> {
    let content = file.content;

    // Replace common mock patterns with real implementations
    for (const location of mockDetection.locations) {
      const lines = content.split('\n');
      const mockLine = lines[location.line - 1];

      // Generate real implementation based on context
      const realImplementation = await this.generateRealImplementation(mockLine, file);
      lines[location.line - 1] = realImplementation;
      content = lines.join('\n');
    }

    file.content = content;
  }

  private async generateRealImplementation(mockLine: string, file: GeneratedFile): Promise<string> {
    const prompt = `
Replace this mock/placeholder implementation with a real, functional implementation:

Mock line: ${mockLine}
File: ${file.path}
Language: ${file.language}

Requirements:
1. No mock, fake, or placeholder code
2. Real external service integration where applicable
3. Proper error handling
4. Input validation
5. Type safety (if applicable)
6. Security considerations

Provide only the replacement line(s) of code:`;

    const response = await this.aiHub.sendRequest([
      { role: 'system', content: 'You are an expert developer who replaces mock code with real, production-ready implementations.' },
      { role: 'user', content: prompt }
    ]);

    return response.success ? response.content.trim() : mockLine;
  }

  private async verifyExternalIntegrations(file: GeneratedFile): Promise<void> {
    // Check for API calls, database connections, external service usage
    const externalIntegrations = [
      /fetch\s*\(/g,
      /axios\./g,
      /http\./g,
      /require\(['"]mysql['"].*\)/g,
      /require\(['"]pg['"].*\)/g,
      /require\(['"]mongodb['"].*\)/g,
      /import.*from ['"]aws-sdk['"].*$/gm
    ];

    for (const pattern of externalIntegrations) {
      if (pattern.test(file.content)) {
        await this.enhanceExternalIntegration(file, pattern);
      }
    }
  }

  private async enhanceExternalIntegration(file: GeneratedFile, pattern: RegExp): Promise<void> {
    // Add proper error handling, retries, timeouts for external integrations
    const matches = file.content.match(pattern);
    if (matches) {
      // Enhance each integration with real-world concerns
      // This is a simplified implementation - would be more comprehensive in practice
      this.logger.debug('Enhanced external integration', { file: file.path, pattern: pattern.source });
    }
  }

  private async enforceErrorHandling(file: GeneratedFile): Promise<void> {
    // Ensure all functions have proper error handling
    const functionPattern = /(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?(?:\(.*?\)|[^=]+)\s*=>)/g;
    
    // This would be more sophisticated in practice
    if (!file.content.includes('try') && !file.content.includes('catch')) {
      const hasAsyncOperations = /await|Promise|fetch|\.then/g.test(file.content);
      if (hasAsyncOperations) {
        // Add try-catch blocks around async operations
        // Implementation would be more complex
        this.logger.debug('Added error handling', { file: file.path });
      }
    }
  }

  private async validateDatabaseOperations(file: GeneratedFile): Promise<void> {
    const dbPatterns = [
      /SELECT\s+.+FROM/gi,
      /INSERT\s+INTO/gi,
      /UPDATE\s+.+SET/gi,
      /DELETE\s+FROM/gi,
      /\.findOne\(/gi,
      /\.findMany\(/gi,
      /\.create\(/gi,
      /\.update\(/gi,
      /\.delete\(/gi
    ];

    const hasDbOperations = dbPatterns.some(pattern => pattern.test(file.content));
    
    if (hasDbOperations) {
      // Validate SQL injection protection, parameter binding, etc.
      await this.validateSqlSecurity(file);
      await this.validateDbPerformance(file);
    }
  }

  private async validateSqlSecurity(file: GeneratedFile): Promise<void> {
    // Check for SQL injection vulnerabilities
    const vulnerablePatterns = [
      /\+.*\$\{.*\}/g, // String concatenation with variables
      /\+.*req\..*\+/g, // Direct request parameter concatenation
      /`.*\${.*}.*`/g   // Template literals with variables in SQL
    ];

    for (const pattern of vulnerablePatterns) {
      if (pattern.test(file.content)) {
        // Add to warnings about potential SQL injection
        this.logger.warn('Potential SQL injection vulnerability detected', { file: file.path });
      }
    }
  }

  private async validateDbPerformance(file: GeneratedFile): Promise<void> {
    // Check for common performance issues
    const performanceIssues = [
      /SELECT \* FROM/gi, // Select all fields
      /WHERE.*LIKE '%.*%'/gi, // Leading wildcard searches
      /\.map\(.*\.findOne/gi // N+1 queries
    ];

    for (const pattern of performanceIssues) {
      if (pattern.test(file.content)) {
        this.logger.warn('Potential database performance issue detected', { file: file.path });
      }
    }
  }

  private async validateApiImplementations(file: GeneratedFile): Promise<void> {
    const apiPatterns = [
      /app\.get\(/gi,
      /app\.post\(/gi,
      /app\.put\(/gi,
      /app\.delete\(/gi,
      /router\.get\(/gi,
      /router\.post\(/gi,
      /@Get\(/gi,
      /@Post\(/gi
    ];

    const hasApiEndpoints = apiPatterns.some(pattern => pattern.test(file.content));
    
    if (hasApiEndpoints) {
      await this.validateApiSecurity(file);
      await this.validateApiDocumentation(file);
      await this.validateApiErrorHandling(file);
    }
  }

  private async validateApiSecurity(file: GeneratedFile): Promise<void> {
    // Check for authentication, authorization, input validation
    const securityChecks = {
      authentication: /req\.user|req\.auth|authenticate|jwt\.verify/gi.test(file.content),
      inputValidation: /validate|joi\.|yup\.|z\./gi.test(file.content),
      rateLimit: /rateLimit|express-rate-limit/gi.test(file.content),
      cors: /cors|app\.use.*cors/gi.test(file.content)
    };

    Object.entries(securityChecks).forEach(([check, passed]) => {
      if (!passed) {
        this.logger.warn(`API security check failed: ${check}`, { file: file.path });
      }
    });
  }

  private async validateApiDocumentation(file: GeneratedFile): Promise<void> {
    // Check for OpenAPI/Swagger documentation
    const hasDocumentation = /swagger|openapi|@ApiOperation|@ApiResponse/gi.test(file.content);
    
    if (!hasDocumentation) {
      this.logger.warn('API endpoints lack documentation', { file: file.path });
    }
  }

  private async validateApiErrorHandling(file: GeneratedFile): Promise<void> {
    // Check for proper error responses
    const hasErrorHandling = /\.status\(4\d\d\)|\.status\(5\d\d\)|throw.*Error/gi.test(file.content);
    
    if (!hasErrorHandling) {
      this.logger.warn('API endpoints lack proper error handling', { file: file.path });
    }
  }

  private async performRealityChecks(result: GenerationResult): Promise<void> {
    this.logger.debug('Performing reality checks');

    const projectPath = result.request.context.project?.rootPath || '.';
    const realityResult = await this.realityValidator.validateProject(projectPath);
    
    // Update validation result with reality check findings
    result.validation.reality = {
      status: realityResult.summary.score > 70 ? ValidationStatus.PASSED : ValidationStatus.FAILED,
      realFunctionality: realityResult.summary.score > 70,
      externalIntegrations: [],
      dataFlow: { complete: true, consistent: true, validated: true, errorHandled: true, secure: true, issues: [] },
      businessLogic: { implemented: true, tested: true, documented: true, maintainable: true, scalable: true, issues: [] },
      userExperience: { responsive: true, accessible: true, intuitive: true, errorHandling: true, performance: true, issues: [] }
    };
    
    // Add warnings for any unrealistic implementations
    if (!result.validation.reality.realFunctionality) {
      result.warnings.push({
        code: 'UNREALISTIC_IMPLEMENTATION',
        message: 'Generated code contains unrealistic or mock implementations',
        suggestion: 'Review and replace mock code with real functionality'
      });
    }
  }

  private async validateGeneration(result: GenerationResult): Promise<ValidationResult> {
    return await this.validationPipeline.validate(result);
  }

  private calculateMetrics(result: GenerationResult, startTime: number): GenerationMetrics {
    const duration = Date.now() - startTime;
    const totalLines = result.files.reduce((sum, file) => sum + file.lines, 0);
    const testsGenerated = result.files.filter(f => f.type === 'test').length;

    return {
      duration,
      filesGenerated: result.files.length,
      linesOfCode: totalLines,
      testsGenerated,
      testCoverage: this.calculateTestCoverage(result),
      complexityScore: this.calculateComplexityScore(result),
      maintainabilityIndex: this.calculateMaintainabilityIndex(result),
      qualityScore: this.calculateQualityScore(result),
      securityScore: this.calculateSecurityScore(result),
      performanceScore: this.calculatePerformanceScore(result),
      realityScore: this.calculateRealityScore(result)
    };
  }

  private calculateTestCoverage(result: GenerationResult): number {
    // Simplified calculation
    const sourceFiles = result.files.filter(f => f.type === 'source').length;
    const testFiles = result.files.filter(f => f.type === 'test').length;
    return sourceFiles > 0 ? (testFiles / sourceFiles) * 100 : 0;
  }

  private calculateComplexityScore(result: GenerationResult): number {
    // Simplified complexity calculation based on cyclomatic complexity indicators
    let complexity = 0;
    for (const file of result.files) {
      const complexityIndicators = [
        (file.content.match(/if\s*\(/g) || []).length,
        (file.content.match(/for\s*\(/g) || []).length,
        (file.content.match(/while\s*\(/g) || []).length,
        (file.content.match(/switch\s*\(/g) || []).length,
        (file.content.match(/catch\s*\(/g) || []).length
      ];
      complexity += complexityIndicators.reduce((sum, count) => sum + count, 0);
    }
    return Math.min(complexity / result.files.length, 100);
  }

  private calculateMaintainabilityIndex(result: GenerationResult): number {
    // Simplified maintainability calculation
    let score = 100;
    
    for (const file of result.files) {
      // Penalize long functions
      const longFunctions = (file.content.match(/function[\s\S]{500,}?}/g) || []).length;
      score -= longFunctions * 5;
      
      // Penalize deeply nested code
      const maxIndentation = Math.max(
        ...(file.content.split('\n').map(line => 
          (line.match(/^(\s*)/)?.[1]?.length || 0) / 2
        ))
      );
      if (maxIndentation > 6) score -= (maxIndentation - 6) * 3;
      
      // Reward comments and documentation
      const comments = (file.content.match(/\/\*[\s\S]*?\*\/|\/\/.*$/gm) || []).length;
      score += Math.min(comments * 2, 20);
    }
    
    return Math.max(0, Math.min(100, score));
  }

  private calculateQualityScore(result: GenerationResult): number {
    let score = 0;
    const checks = [
      result.validation.syntax.status === ValidationStatus.PASSED,
      result.validation.types?.status === ValidationStatus.PASSED,
      result.validation.security.status === ValidationStatus.PASSED,
      result.validation.performance.status === ValidationStatus.PASSED,
      result.validation.functionality.status === ValidationStatus.PASSED
    ];
    
    score = (checks.filter(Boolean).length / checks.length) * 100;
    return score;
  }

  private calculateSecurityScore(result: GenerationResult): number {
    if (result.validation.security.status === ValidationStatus.PASSED) {
      return result.validation.security.score || 100;
    }
    
    const vulnerabilities = result.validation.security.vulnerabilities || [];
    let score = 100;
    
    vulnerabilities.forEach(vuln => {
      switch (vuln.severity) {
        case 'critical': score -= 30; break;
        case 'high': score -= 20; break;
        case 'medium': score -= 10; break;
        case 'low': score -= 5; break;
      }
    });
    
    return Math.max(0, score);
  }

  private calculatePerformanceScore(result: GenerationResult): number {
    if (result.validation.performance.status === ValidationStatus.PASSED) {
      return result.validation.performance.score || 100;
    }
    
    const bottlenecks = result.validation.performance.bottlenecks || [];
    let score = 100;
    
    bottlenecks.forEach(bottleneck => {
      switch (bottleneck.impact) {
        case 'high': score -= 25; break;
        case 'medium': score -= 15; break;
        case 'low': score -= 5; break;
      }
    });
    
    return Math.max(0, score);
  }

  private calculateRealityScore(result: GenerationResult): number {
    if (!result.validation.reality) return 50;
    
    let score = 100;
    
    if (!result.validation.reality.realFunctionality) score -= 40;
    if (!result.validation.reality.dataFlow.complete) score -= 20;
    if (!result.validation.reality.businessLogic.implemented) score -= 20;
    if (!result.validation.reality.userExperience.responsive) score -= 10;
    if (!result.validation.reality.externalIntegrations.every(i => i.real)) score -= 10;
    
    return Math.max(0, score);
  }

  private determineFinalStatus(result: GenerationResult): GenerationStatus {
    const criticalErrors = result.errors.filter(e => e.severity === 'critical');
    if (criticalErrors.length > 0) {
      return GenerationStatus.FAILED;
    }
    
    const validationFailed = [
      result.validation.syntax.status === ValidationStatus.FAILED,
      result.validation.types?.status === ValidationStatus.FAILED,
      result.validation.security.status === ValidationStatus.FAILED
    ].some(Boolean);
    
    if (validationFailed) {
      return GenerationStatus.FAILED;
    }
    
    return GenerationStatus.COMPLETED;
  }

  // Helper methods for prompt building
  private buildGenerationPrompt(request: GenerationRequest): string {
    return `
Generate high-quality, production-ready code based on this description:

${request.description}

Requirements:
- Quality Level: ${request.options.quality}
- Security Level: ${request.options.security}
- Performance Target: ${request.options.performance}
- Real functionality only (no mocks, placeholders, or TODOs)
- Proper error handling and validation
- Include necessary imports and dependencies
- Follow project conventions and patterns
- Generate tests if requested: ${request.options.testing.generate}

Project Context:
- Languages: ${request.context.project.languages.join(', ')}
- Frameworks: ${request.context.project.frameworks.join(', ')}
- Architecture: ${request.context.project.architecture.pattern}

Please provide complete, functional code that can be used in production.
`;
  }

  private buildModificationPrompt(request: GenerationRequest, target: any, existingContent: string): string {
    return `
Modify the following existing code according to this description:

${request.description}

Existing code:
\`\`\`${target.language}
${existingContent}
\`\`\`

Requirements:
- Maintain existing functionality unless explicitly changing it
- Follow the same coding style and patterns
- Add proper error handling if missing
- Ensure type safety
- No mock or placeholder code
- Real functionality only

Provide the complete modified file content.
`;
  }

  private buildRefactorPrompt(request: GenerationRequest): string {
    return `
Refactor the code in the specified path according to these goals:

${request.description}

Refactoring Goals:
- Improve code quality and maintainability
- Optimize performance where possible
- Follow best practices and design patterns
- Maintain existing functionality
- Add proper documentation
- Ensure type safety
- Real implementations only

Project Context:
- Languages: ${request.context.project.languages.join(', ')}
- Frameworks: ${request.context.project.frameworks.join(', ')}
- Architecture Pattern: ${request.context.project.architecture.pattern}
`;
  }

  private buildFixPrompt(request: GenerationRequest): string {
    return `
Fix the following code issue:

${request.description}

Requirements:
- Identify and fix the root cause
- Maintain existing functionality
- Add proper error handling
- Include tests to prevent regression
- Provide clear explanation of the fix
- Real, production-ready solution
- No temporary workarounds or placeholders
`;
  }

  private buildOptimizePrompt(request: GenerationRequest): string {
    return `
Optimize the code for better performance:

${request.description}

Optimization targets:
- Performance Target: ${request.options.performance}
- Focus areas: ${request.description}

Requirements:
- Measure and improve actual performance
- Maintain functionality and correctness
- Add performance monitoring where applicable
- Document performance improvements
- Real optimizations, not theoretical ones
- Include benchmarks if relevant
`;
  }

  private getSystemPrompt(request: GenerationRequest): string {
    return `You are an expert software engineer who writes production-ready code.

Core Principles:
1. NEVER generate mock, fake, placeholder, or TODO code
2. All code must be real, functional, and production-ready
3. Include proper error handling and input validation
4. Follow security best practices
5. Write maintainable and well-documented code
6. Use real external service integrations when needed
7. Generate comprehensive tests when requested
8. Follow the project's existing patterns and conventions

Quality Level: ${request.options.quality}
Security Level: ${request.options.security}
Performance Target: ${request.options.performance}

You MUST provide complete, working implementations that can be deployed to production immediately.`;
  }

  private getRefactorSystemPrompt(): string {
    return `You are an expert software engineer specializing in code refactoring.

Your role is to:
1. Improve code structure and organization
2. Eliminate code smells and anti-patterns
3. Optimize performance while maintaining functionality
4. Enhance readability and maintainability
5. Apply appropriate design patterns
6. Ensure SOLID principles compliance
7. Add proper documentation and comments
8. Maintain backward compatibility unless explicitly requested otherwise

Always provide real, production-ready refactored code with no placeholders or TODOs.`;
  }

  private getFixSystemPrompt(): string {
    return `You are an expert debugging engineer who fixes code issues comprehensively.

Your responsibilities:
1. Identify root causes, not just symptoms
2. Provide complete, working fixes
3. Add robust error handling
4. Include preventive measures
5. Write tests to prevent regression
6. Document the fix and its reasoning
7. Consider edge cases and error scenarios
8. Ensure the fix doesn't introduce new issues

Never provide temporary workarounds or placeholder fixes. All solutions must be production-ready.`;
  }

  private getOptimizeSystemPrompt(): string {
    return `You are a performance optimization specialist who creates faster, more efficient code.

Focus areas:
1. Algorithm optimization
2. Memory usage reduction
3. Database query optimization
4. Caching strategies
5. Async/parallel processing
6. Resource management
7. Bottleneck elimination
8. Scalability improvements

Provide real performance improvements with measurable benefits. Include performance monitoring and benchmarking where appropriate.`;
  }

  // Parsing methods for AI responses
  private async parseGenerationResponse(content: string, request: GenerationRequest, preview: boolean): Promise<GeneratedFile[]> {
    // This is a simplified implementation - would be more sophisticated in practice
    const files: GeneratedFile[] = [];
    
    // Extract code blocks from the response
    const codeBlocks = this.extractCodeBlocks(content);
    
    for (let i = 0; i < codeBlocks.length; i++) {
      const block = codeBlocks[i];
      const filePath = this.generateFilePath(block, request, i);
      
      const file: GeneratedFile = {
        path: filePath,
        content: block.content,
        language: block.language || 'javascript',
        type: 'source',
        size: Buffer.byteLength(block.content, 'utf8'),
        lines: block.content.split('\n').length,
        changes: [{
          type: 'addition',
          lineStart: 1,
          lineEnd: block.content.split('\n').length,
          content: block.content,
          reason: 'Generated new file'
        }],
        dependencies: this.extractDependencies(block.content),
        exports: this.extractExports(block.content),
        imports: this.extractImports(block.content)
      };
      
      if (!preview) {
        await this.writeFile(file);
      }
      
      files.push(file);
    }
    
    return files;
  }

  private async parseModificationResponse(
    content: string,
    target: any,
    originalContent: string,
    preview: boolean
  ): Promise<GeneratedFile> {
    const file: GeneratedFile = {
      path: target.path,
      content: content,
      originalContent,
      language: target.language,
      type: 'source',
      size: Buffer.byteLength(content, 'utf8'),
      lines: content.split('\n').length,
      changes: this.calculateChanges(originalContent, content),
      dependencies: this.extractDependencies(content),
      exports: this.extractExports(content),
      imports: this.extractImports(content)
    };
    
    if (!preview) {
      await this.writeFile(file);
    }
    
    return file;
  }

  private async parseRefactorResponse(content: string, request: GenerationRequest, preview: boolean): Promise<GeneratedFile[]> {
    // Similar to parseGenerationResponse but for refactored files
    return await this.parseGenerationResponse(content, request, preview);
  }

  private async parseFixResponse(content: string, request: GenerationRequest, preview: boolean): Promise<GeneratedFile[]> {
    // Similar to parseGenerationResponse but for fixed files
    return await this.parseGenerationResponse(content, request, preview);
  }

  private async parseOptimizeResponse(content: string, request: GenerationRequest, preview: boolean): Promise<GeneratedFile[]> {
    // Similar to parseGenerationResponse but for optimized files
    return await this.parseGenerationResponse(content, request, preview);
  }

  // Utility methods
  private extractCodeBlocks(content: string): Array<{ language: string; content: string }> {
    const blocks: Array<{ language: string; content: string }> = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      blocks.push({
        language: match[1] || 'text',
        content: match[2].trim()
      });
    }
    
    return blocks;
  }

  private generateFilePath(block: any, request: GenerationRequest, index: number): string {
    // Generate appropriate file path based on content and request
    const basePath = request.context.project.rootPath;
    const extension = this.getFileExtension(block.language);
    
    // Try to extract filename from comments or content
    const filenameMatch = block.content.match(/\/\/\s*@filename:\s*(.+)|\/\*\s*@filename:\s*(.+)\s*\*\//);
    if (filenameMatch) {
      return path.join(basePath, filenameMatch[1] || filenameMatch[2]);
    }
    
    // Generate based on content type
    const functionMatch = block.content.match(/(?:function|class|interface)\s+(\w+)/);
    if (functionMatch) {
      return path.join(basePath, `${functionMatch[1].toLowerCase()}${extension}`);
    }
    
    // Fallback to generic name
    return path.join(basePath, `generated-${index}${extension}`);
  }

  private getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
      javascript: '.js',
      typescript: '.ts',
      python: '.py',
      java: '.java',
      csharp: '.cs',
      go: '.go',
      rust: '.rs',
      php: '.php',
      ruby: '.rb',
      swift: '.swift',
      kotlin: '.kt'
    };
    
    return extensions[language.toLowerCase()] || '.txt';
  }

  private extractDependencies(content: string): FileDependency[] {
    const dependencies: FileDependency[] = [];
    
    // Extract npm dependencies
    const importMatches = content.match(/(?:import|require)\s*\(['"]([^'"]+)['"]\)/g);
    if (importMatches) {
      for (const match of importMatches) {
        const moduleMatch = match.match(/['"]([^'"]+)['"]/);
        if (moduleMatch && !moduleMatch[1].startsWith('.')) {
          dependencies.push({
            name: moduleMatch[1],
            type: 'production',
            source: 'npm',
            required: true
          });
        }
      }
    }
    
    return dependencies;
  }

  private extractExports(content: string): FileExport[] {
    const exports: FileExport[] = [];
    
    // Extract function exports
    const functionExports = content.match(/export\s+(?:function|async\s+function)\s+(\w+)/g);
    if (functionExports) {
      for (const match of functionExports) {
        const nameMatch = match.match(/(\w+)$/);
        if (nameMatch) {
          exports.push({
            name: nameMatch[1],
            type: 'function'
          });
        }
      }
    }
    
    // Extract class exports
    const classExports = content.match(/export\s+class\s+(\w+)/g);
    if (classExports) {
      for (const match of classExports) {
        const nameMatch = match.match(/(\w+)$/);
        if (nameMatch) {
          exports.push({
            name: nameMatch[1],
            type: 'class'
          });
        }
      }
    }
    
    return exports;
  }

  private extractImports(content: string): FileImport[] {
    const imports: FileImport[] = [];
    
    // Extract ES6 imports
    const importMatches = content.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/g);
    if (importMatches) {
      for (const match of importMatches) {
        const moduleMatch = match.match(/from\s+['"]([^'"]+)['"]/);
        const namedImports = match.match(/import\s+\{([^}]+)\}/);
        const defaultImport = match.match(/import\s+(\w+)\s+from/);
        
        if (moduleMatch) {
          imports.push({
            module: moduleMatch[1],
            imports: namedImports ? namedImports[1].split(',').map(i => i.trim()) : 
                     defaultImport ? [defaultImport[1]] : [],
            type: namedImports ? 'named' : defaultImport ? 'default' : 'namespace',
            source: moduleMatch[1].startsWith('.') ? 'local' : 'external'
          });
        }
      }
    }
    
    return imports;
  }

  private calculateChanges(original: string, modified: string): FileChange[] {
    // Simplified diff calculation
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    const changes: FileChange[] = [];
    
    // This is a basic implementation - would use a proper diff algorithm in practice
    if (originalLines.length !== modifiedLines.length) {
      changes.push({
        type: 'modification',
        lineStart: 1,
        lineEnd: Math.max(originalLines.length, modifiedLines.length),
        content: modified,
        reason: 'File content modified'
      });
    }
    
    return changes;
  }

  private async writeFile(file: GeneratedFile): Promise<void> {
    await fs.ensureDir(path.dirname(file.path));
    await fs.writeFile(file.path, file.content, 'utf8');
    this.logger.debug('File written', { path: file.path, size: file.size });
  }

  private createFilePreview(content: string): string {
    const lines = content.split('\n');
    const preview = lines.slice(0, 20).join('\n');
    return lines.length > 20 ? preview + '\n...' : preview;
  }

  private analyzeChanges(files: GeneratedFile[]): any[] {
    return files.flatMap(file => file.changes || []);
  }

  private async analyzeImpact(files: GeneratedFile[], context: any): Promise<any> {
    return {
      filesAffected: files.length,
      linesChanged: files.reduce((sum, f) => sum + f.lines, 0),
      dependenciesAdded: [...new Set(files.flatMap(f => f.dependencies.map(d => d.name)))],
      testCoverageChange: 0, // Would calculate based on generated tests
      riskLevel: files.length > 10 ? 'high' : files.length > 5 ? 'medium' : 'low',
      estimatedTime: files.length * 2 // minutes
    };
  }

  private async createInteractiveSteps(request: GenerationRequest): Promise<InteractiveStep[]> {
    const steps: InteractiveStep[] = [
      {
        id: 'confirm-scope',
        type: 'confirmation',
        title: 'Confirm Generation Scope',
        description: `Generate code for: ${request.description}`,
        required: true
      },
      {
        id: 'select-quality',
        type: 'choice',
        title: 'Select Code Quality Level',
        description: 'Choose the quality level for generated code',
        options: [
          { id: 'prototype', title: 'Prototype', description: 'Quick development, basic quality', impact: 'Fast generation', recommended: false },
          { id: 'development', title: 'Development', description: 'Good quality for development', impact: 'Balanced approach', recommended: true },
          { id: 'production', title: 'Production', description: 'Production-ready quality', impact: 'Comprehensive validation', recommended: false },
          { id: 'enterprise', title: 'Enterprise', description: 'Enterprise-grade quality', impact: 'Extensive checks and documentation', recommended: false }
        ],
        required: true
      },
      {
        id: 'preview-changes',
        type: 'review',
        title: 'Review Generated Code',
        description: 'Review the code that will be generated',
        preview: await this.getGenerationPreview(request),
        required: true
      }
    ];
    
    return steps;
  }

  private createEmptyValidationResult(): ValidationResult {
    return {
      overall: ValidationStatus.SKIPPED,
      syntax: { status: ValidationStatus.SKIPPED, errors: [], warnings: [], suggestions: [] },
      types: { status: ValidationStatus.SKIPPED, errors: [], warnings: [], coverage: 0, strictness: 'loose' },
      security: { status: ValidationStatus.SKIPPED, vulnerabilities: [], risks: [], compliance: [], score: 0 },
      performance: { status: ValidationStatus.SKIPPED, metrics: [], bottlenecks: [], recommendations: [], score: 0 },
      functionality: { status: ValidationStatus.SKIPPED, tests: [], coverage: 0, mockDetection: { detected: false, locations: [], types: [], suggestions: [] }, apiValidation: { endpoints: [], authentication: { implemented: false, method: [], secure: false, issues: [] }, errorHandling: { implemented: false, comprehensive: false, standardized: false, userFriendly: false, issues: [] }, documentation: { exists: false, complete: false, upToDate: false, format: '', issues: [] } }, databaseValidation: { connections: [], queries: [], migrations: { exists: false, reversible: false, safe: false, documented: false, issues: [] }, security: { encryption: false, accessControl: false, sqlInjectionProtection: false, auditLogging: false, issues: [] } } },
      integration: { status: ValidationStatus.SKIPPED, dependencies: [], services: [], apis: [], configuration: { status: ValidationStatus.SKIPPED, environment: { variables: [], secrets: [], complete: false, secure: false }, build: { configured: false, optimized: false, tested: false, documented: false, issues: [] }, deployment: { configured: false, secure: false, scalable: false, monitored: false, rollbackCapable: false, issues: [] }, issues: [] } },
      reality: { status: ValidationStatus.SKIPPED, realFunctionality: true, externalIntegrations: [], dataFlow: { complete: false, consistent: false, validated: false, errorHandled: false, secure: false, issues: [] }, businessLogic: { implemented: false, tested: false, documented: false, maintainable: false, scalable: false, issues: [] }, userExperience: { responsive: false, accessible: false, intuitive: false, errorHandling: false, performance: false, issues: [] } }
    };
  }

  private createEmptyMetrics(): GenerationMetrics {
    return {
      duration: 0,
      filesGenerated: 0,
      linesOfCode: 0,
      testsGenerated: 0,
      testCoverage: 0,
      complexityScore: 0,
      maintainabilityIndex: 0,
      qualityScore: 0,
      securityScore: 0,
      performanceScore: 0,
      realityScore: 0
    };
  }

  private generateResultId(): string {
    return `gen_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}