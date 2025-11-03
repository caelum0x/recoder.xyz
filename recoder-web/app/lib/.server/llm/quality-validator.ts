/**
 * Quality Validation System for Generated Code
 * Ensures code quality and provides feedback for optimization
 */

export interface QualityMetrics {
  syntaxScore: number; // 0-100, syntax validity
  structureScore: number; // 0-100, project structure quality
  completenessScore: number; // 0-100, feature completeness
  bestPracticesScore: number; // 0-100, follows best practices
  performanceScore: number; // 0-100, performance considerations
  overallScore: number; // 0-100, weighted average
  issues: QualityIssue[];
  suggestions: string[];
}

export interface QualityIssue {
  type: 'error' | 'warning' | 'info';
  category: 'syntax' | 'structure' | 'performance' | 'security' | 'best-practice';
  message: string;
  file?: string;
  line?: number;
  severity: number; // 1-10
}

export interface ValidationConfig {
  enabled: boolean;
  strictMode: boolean;
  checkSyntax: boolean;
  checkStructure: boolean;
  checkBestPractices: boolean;
  checkPerformance: boolean;
  checkSecurity: boolean;
  frameworkRules: Record<string, any>;
}

class QualityValidator {
  private config: ValidationConfig;

  constructor(config?: Partial<ValidationConfig>) {
    this.config = {
      enabled: true,
      strictMode: false,
      checkSyntax: true,
      checkStructure: true,
      checkBestPractices: true,
      checkPerformance: true,
      checkSecurity: true,
      frameworkRules: {
        react: {
          requireTypeScript: true,
          componentNaming: 'PascalCase',
          hooksRules: true,
          propTypesRequired: false
        },
        nextjs: {
          appRouterPreferred: true,
          requireMetadata: true,
          optimizedImages: true
        },
        vue: {
          singleFileComponents: true,
          compositionApiPreferred: true
        },
        node: {
          requireErrorHandling: true,
          asyncAwaitPreferred: true,
          environmentVariables: true
        }
      },
      ...config
    };
  }

  /**
   * Validate generated code artifacts
   */
  async validateArtifact(artifact: any): Promise<QualityMetrics> {
    if (!this.config.enabled) {
      return this.getDefaultMetrics();
    }

    const issues: QualityIssue[] = [];
    const suggestions: string[] = [];

    // Parse artifact content
    const files = this.extractFiles(artifact);
    const framework = this.detectFramework(files);

    // Run various quality checks
    const syntaxScore = await this.checkSyntax(files, issues);
    const structureScore = await this.checkStructure(files, framework, issues);
    const completenessScore = await this.checkCompleteness(files, framework, issues);
    const bestPracticesScore = await this.checkBestPractices(files, framework, issues);
    const performanceScore = await this.checkPerformance(files, framework, issues);

    // Generate suggestions based on issues
    this.generateSuggestions(issues, suggestions, framework);

    // Calculate overall score (weighted average)
    const overallScore = this.calculateOverallScore({
      syntaxScore,
      structureScore,
      completenessScore,
      bestPracticesScore,
      performanceScore
    });

    return {
      syntaxScore,
      structureScore,
      completenessScore,
      bestPracticesScore,
      performanceScore,
      overallScore,
      issues,
      suggestions
    };
  }

  /**
   * Extract files from artifact
   */
  private extractFiles(artifact: any): Record<string, string> {
    const files: Record<string, string> = {};

    if (typeof artifact === 'string') {
      // Parse artifact content to extract files
      const fileMatches = artifact.match(/<boltAction[^>]*type="file"[^>]*filePath="([^"]*)"[^>]*>(.*?)<\/boltAction>/gs);

      if (fileMatches) {
        fileMatches.forEach(match => {
          const pathMatch = match.match(/filePath="([^"]*)"/);
          const contentMatch = match.match(/>(.*?)<\/boltAction>/s);

          if (pathMatch && contentMatch) {
            files[pathMatch[1]] = contentMatch[1].trim();
          }
        });
      }
    }

    return files;
  }

  /**
   * Detect framework from files
   */
  private detectFramework(files: Record<string, string>): string {
    const fileNames = Object.keys(files);
    const packageJson = files['package.json'];

    if (packageJson) {
      try {
        const pkg = JSON.parse(packageJson);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps['next']) return 'nextjs';
        if (deps['react']) return 'react';
        if (deps['vue']) return 'vue';
        if (deps['@vue/cli-service']) return 'vue';
        if (deps['svelte']) return 'svelte';
        if (deps['express']) return 'node';
        if (deps['fastify']) return 'node';
      } catch (e) {
        // Invalid package.json
      }
    }

    // Fallback detection based on file extensions
    if (fileNames.some(f => f.endsWith('.vue'))) return 'vue';
    if (fileNames.some(f => f.endsWith('.svelte'))) return 'svelte';
    if (fileNames.some(f => f.includes('app/') || f.includes('pages/'))) return 'nextjs';
    if (fileNames.some(f => f.endsWith('.jsx') || f.endsWith('.tsx'))) return 'react';

    return 'vanilla';
  }

  /**
   * Check syntax validity
   */
  private async checkSyntax(files: Record<string, string>, issues: QualityIssue[]): Promise<number> {
    if (!this.config.checkSyntax) return 100;

    let totalFiles = 0;
    let validFiles = 0;

    for (const [filePath, content] of Object.entries(files)) {
      totalFiles++;

      try {
        // Basic syntax checks
        if (filePath.endsWith('.json')) {
          JSON.parse(content);
        } else if (filePath.endsWith('.js') || filePath.endsWith('.ts') ||
                   filePath.endsWith('.jsx') || filePath.endsWith('.tsx')) {
          // Check for basic syntax errors
          this.checkJavaScriptSyntax(content, filePath, issues);
        }

        validFiles++;
      } catch (error) {
        issues.push({
          type: 'error',
          category: 'syntax',
          message: `Syntax error in ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          file: filePath,
          severity: 9
        });
      }
    }

    return totalFiles > 0 ? (validFiles / totalFiles) * 100 : 100;
  }

  /**
   * Check JavaScript/TypeScript syntax
   */
  private checkJavaScriptSyntax(content: string, filePath: string, issues: QualityIssue[]): void {
    // Basic checks for common syntax issues
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for unclosed brackets/braces
      const openBrackets = (line.match(/\[/g) || []).length;
      const closeBrackets = (line.match(/\]/g) || []).length;
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;

      // Check for missing semicolons (basic check)
      if (line.trim().match(/^(let|const|var|return|throw)\s+.*[^;{}]$/) &&
          !line.includes('//') && !line.includes('/*')) {
        issues.push({
          type: 'warning',
          category: 'syntax',
          message: 'Missing semicolon',
          file: filePath,
          line: lineNum,
          severity: 3
        });
      }

      // Check for console.log statements (should be removed in production)
      if (line.includes('console.log') || line.includes('console.warn')) {
        issues.push({
          type: 'info',
          category: 'best-practice',
          message: 'Remove console statements for production',
          file: filePath,
          line: lineNum,
          severity: 2
        });
      }
    });
  }

  /**
   * Check project structure
   */
  private async checkStructure(
    files: Record<string, string>,
    framework: string,
    issues: QualityIssue[]
  ): Promise<number> {
    if (!this.config.checkStructure) return 100;

    let score = 100;
    const fileNames = Object.keys(files);

    // Check for package.json
    if (!files['package.json']) {
      issues.push({
        type: 'error',
        category: 'structure',
        message: 'Missing package.json file',
        severity: 8
      });
      score -= 20;
    }

    // Framework-specific structure checks
    switch (framework) {
      case 'react':
      case 'nextjs':
        if (!fileNames.some(f => f.includes('src/') || f.includes('app/'))) {
          issues.push({
            type: 'warning',
            category: 'structure',
            message: 'Consider using src/ or app/ directory for better organization',
            severity: 4
          });
          score -= 10;
        }
        break;

      case 'vue':
        if (!fileNames.some(f => f.endsWith('.vue'))) {
          issues.push({
            type: 'warning',
            category: 'structure',
            message: 'No Vue single file components found',
            severity: 5
          });
          score -= 15;
        }
        break;

      case 'node':
        if (!fileNames.includes('index.js') && !fileNames.includes('server.js') &&
            !fileNames.includes('app.js')) {
          issues.push({
            type: 'warning',
            category: 'structure',
            message: 'No main server file found (index.js, server.js, or app.js)',
            severity: 6
          });
          score -= 15;
        }
        break;
    }

    return Math.max(0, score);
  }

  /**
   * Check feature completeness
   */
  private async checkCompleteness(
    files: Record<string, string>,
    framework: string,
    issues: QualityIssue[]
  ): Promise<number> {
    let score = 100;
    const fileNames = Object.keys(files);

    // Check for essential files based on framework
    const requiredFiles = this.getRequiredFiles(framework);
    const missingFiles = requiredFiles.filter(file => !fileNames.includes(file));

    if (missingFiles.length > 0) {
      issues.push({
        type: 'warning',
        category: 'structure',
        message: `Missing recommended files: ${missingFiles.join(', ')}`,
        severity: 5
      });
      score -= missingFiles.length * 10;
    }

    return Math.max(0, score);
  }

  /**
   * Check best practices
   */
  private async checkBestPractices(
    files: Record<string, string>,
    framework: string,
    issues: QualityIssue[]
  ): Promise<number> {
    if (!this.config.checkBestPractices) return 100;

    let score = 100;

    for (const [filePath, content] of Object.entries(files)) {
      // Check TypeScript usage
      if (this.config.frameworkRules[framework]?.requireTypeScript &&
          filePath.endsWith('.js') && !filePath.includes('config')) {
        issues.push({
          type: 'info',
          category: 'best-practice',
          message: 'Consider using TypeScript for better type safety',
          file: filePath,
          severity: 3
        });
        score -= 5;
      }

      // Check component naming (React/Vue)
      if (framework === 'react' && filePath.endsWith('.jsx')) {
        const componentName = filePath.split('/').pop()?.replace('.jsx', '');
        if (componentName && !/^[A-Z]/.test(componentName)) {
          issues.push({
            type: 'warning',
            category: 'best-practice',
            message: 'React components should use PascalCase naming',
            file: filePath,
            severity: 4
          });
          score -= 5;
        }
      }

      // Check for hardcoded values
      if (content.includes('localhost:') || content.includes('127.0.0.1')) {
        issues.push({
          type: 'warning',
          category: 'best-practice',
          message: 'Avoid hardcoded URLs, use environment variables',
          file: filePath,
          severity: 5
        });
        score -= 5;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Check performance considerations
   */
  private async checkPerformance(
    files: Record<string, string>,
    framework: string,
    issues: QualityIssue[]
  ): Promise<number> {
    if (!this.config.checkPerformance) return 100;

    let score = 100;

    // Check for performance optimizations
    for (const [filePath, content] of Object.entries(files)) {
      // Check for image optimization
      if (content.includes('<img') && !content.includes('next/image') && framework === 'nextjs') {
        issues.push({
          type: 'info',
          category: 'performance',
          message: 'Consider using next/image for optimized images',
          file: filePath,
          severity: 3
        });
        score -= 5;
      }

      // Check for lazy loading
      if (framework === 'react' && content.includes('import ') &&
          !content.includes('lazy(') && filePath.includes('components/')) {
        issues.push({
          type: 'info',
          category: 'performance',
          message: 'Consider lazy loading components for better performance',
          file: filePath,
          severity: 2
        });
        score -= 3;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(
    issues: QualityIssue[],
    suggestions: string[],
    framework: string
  ): void {
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;

    if (errorCount > 0) {
      suggestions.push(`Fix ${errorCount} critical error${errorCount > 1 ? 's' : ''} before deployment`);
    }

    if (warningCount > 3) {
      suggestions.push('Consider addressing warnings to improve code quality');
    }

    // Framework-specific suggestions
    const syntaxIssues = issues.filter(i => i.category === 'syntax').length;
    if (syntaxIssues > 0) {
      suggestions.push('Add a linter (ESLint) to catch syntax issues automatically');
    }

    const performanceIssues = issues.filter(i => i.category === 'performance').length;
    if (performanceIssues > 2) {
      suggestions.push('Implement performance optimizations for better user experience');
    }
  }

  /**
   * Calculate overall quality score
   */
  private calculateOverallScore(scores: {
    syntaxScore: number;
    structureScore: number;
    completenessScore: number;
    bestPracticesScore: number;
    performanceScore: number;
  }): number {
    // Weighted average (syntax and structure are most important)
    const weights = {
      syntaxScore: 0.3,
      structureScore: 0.25,
      completenessScore: 0.2,
      bestPracticesScore: 0.15,
      performanceScore: 0.1
    };

    return Math.round(
      scores.syntaxScore * weights.syntaxScore +
      scores.structureScore * weights.structureScore +
      scores.completenessScore * weights.completenessScore +
      scores.bestPracticesScore * weights.bestPracticesScore +
      scores.performanceScore * weights.performanceScore
    );
  }

  /**
   * Get required files for framework
   */
  private getRequiredFiles(framework: string): string[] {
    const commonFiles = ['package.json', 'README.md'];

    switch (framework) {
      case 'nextjs':
        return [...commonFiles, 'next.config.js', 'tsconfig.json'];
      case 'react':
        return [...commonFiles, 'index.html', 'vite.config.ts'];
      case 'vue':
        return [...commonFiles, 'vite.config.ts', 'index.html'];
      case 'node':
        return [...commonFiles, '.env.example'];
      default:
        return commonFiles;
    }
  }

  /**
   * Get default metrics when validation is disabled
   */
  private getDefaultMetrics(): QualityMetrics {
    return {
      syntaxScore: 100,
      structureScore: 100,
      completenessScore: 100,
      bestPracticesScore: 100,
      performanceScore: 100,
      overallScore: 100,
      issues: [],
      suggestions: []
    };
  }
}

// Global quality validator instance
export const qualityValidator = new QualityValidator();

// Quality thresholds for different environments
export const QUALITY_THRESHOLDS = {
  production: {
    minimumScore: 85,
    allowErrors: false,
    maxWarnings: 3
  },
  development: {
    minimumScore: 70,
    allowErrors: true,
    maxWarnings: 10
  },
  testing: {
    minimumScore: 80,
    allowErrors: false,
    maxWarnings: 5
  }
};