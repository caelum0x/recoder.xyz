/**
 * Quality Validation System for Generated Code
 * Ensures code quality and provides feedback for optimization
 *
 * Enhanced with Lovable-quality standards and comprehensive validation
 */

export interface QualityMetrics {
  syntaxScore: number; // 0-100, syntax validity
  structureScore: number; // 0-100, project structure quality
  completenessScore: number; // 0-100, feature completeness
  bestPracticesScore: number; // 0-100, follows best practices
  performanceScore: number; // 0-100, performance considerations
  uiQualityScore: number; // 0-100, UI/UX quality (NEW)
  accessibilityScore: number; // 0-100, a11y compliance (NEW)
  overallScore: number; // 0-100, weighted average
  issues: QualityIssue[];
  suggestions: string[];
}

export interface QualityIssue {
  type: 'error' | 'warning' | 'info';
  category:
    | 'syntax'
    | 'structure'
    | 'performance'
    | 'security'
    | 'best-practice'
    | 'ui-quality'
    | 'accessibility';
  message: string;
  file?: string;
  line?: number;
  severity: number; // 1-10
  fix?: string; // Suggested fix
}

export interface ValidationConfig {
  enabled: boolean;
  strictMode: boolean;
  checkSyntax: boolean;
  checkStructure: boolean;
  checkBestPractices: boolean;
  checkPerformance: boolean;
  checkSecurity: boolean;
  checkUIQuality: boolean; // NEW
  checkAccessibility: boolean; // NEW
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
      checkUIQuality: true,
      checkAccessibility: true,
      frameworkRules: {
        react: {
          requireTypeScript: true,
          componentNaming: 'PascalCase',
          hooksRules: true,
          propTypesRequired: false,
          requireLoadingStates: true,
          requireErrorHandling: true,
        },
        nextjs: {
          appRouterPreferred: true,
          requireMetadata: true,
          optimizedImages: true,
          serverComponentsDefault: true,
        },
        vue: {
          singleFileComponents: true,
          compositionApiPreferred: true,
          typeScriptSetup: true,
        },
        node: {
          requireErrorHandling: true,
          asyncAwaitPreferred: true,
          environmentVariables: true,
          inputValidation: true,
        },
      },
      ...config,
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
    const uiQualityScore = await this.checkUIQuality(files, framework, issues);
    const accessibilityScore = await this.checkAccessibility(files, issues);

    // Generate suggestions based on issues
    this.generateSuggestions(issues, suggestions, framework);

    // Calculate overall score (weighted average)
    const overallScore = this.calculateOverallScore({
      syntaxScore,
      structureScore,
      completenessScore,
      bestPracticesScore,
      performanceScore,
      uiQualityScore,
      accessibilityScore,
    });

    return {
      syntaxScore,
      structureScore,
      completenessScore,
      bestPracticesScore,
      performanceScore,
      uiQualityScore,
      accessibilityScore,
      overallScore,
      issues,
      suggestions,
    };
  }

  /**
   * Extract files from artifact
   */
  private extractFiles(artifact: any): Record<string, string> {
    const files: Record<string, string> = {};

    if (typeof artifact === 'string') {
      // Parse artifact content to extract files
      const fileMatches = artifact.match(/<recoderAction[^>]*type="file"[^>]*filePath="([^"]*)"[^>]*>(.*?)<\/recoderAction>/gs);

      if (fileMatches) {
        fileMatches.forEach(match => {
          const pathMatch = match.match(/filePath="([^"]*)"/);
          const contentMatch = match.match(/>(.*?)<\/recoderAction>/s);

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
      if (
        content.includes('<img') &&
        !content.includes('next/image') &&
        framework === 'nextjs'
      ) {
        issues.push({
          type: 'info',
          category: 'performance',
          message: 'Consider using next/image for optimized images',
          file: filePath,
          severity: 3,
          fix: "Import Image from 'next/image' and use <Image src={...} alt={...} width={...} height={...} />",
        });
        score -= 5;
      }

      // Check for lazy loading
      if (
        framework === 'react' &&
        content.includes('import ') &&
        !content.includes('lazy(') &&
        filePath.includes('components/')
      ) {
        issues.push({
          type: 'info',
          category: 'performance',
          message: 'Consider lazy loading components for better performance',
          file: filePath,
          severity: 2,
          fix: "Use React.lazy(() => import('./Component')) for code splitting",
        });
        score -= 3;
      }

      // Check for useMemo/useCallback usage in complex computations
      if (
        content.includes('.map(') &&
        content.includes('.filter(') &&
        !content.includes('useMemo')
      ) {
        issues.push({
          type: 'info',
          category: 'performance',
          message: 'Consider using useMemo for expensive computations',
          file: filePath,
          severity: 2,
        });
        score -= 3;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Check UI quality (Lovable-quality standards)
   */
  private async checkUIQuality(
    files: Record<string, string>,
    framework: string,
    issues: QualityIssue[]
  ): Promise<number> {
    if (!this.config.checkUIQuality) return 100;

    let score = 100;

    for (const [filePath, content] of Object.entries(files)) {
      // Skip non-component files
      if (
        !filePath.endsWith('.tsx') &&
        !filePath.endsWith('.jsx') &&
        !filePath.endsWith('.vue')
      ) {
        continue;
      }

      // Check for loading states
      if (
        content.includes('fetch(') ||
        content.includes('useEffect') ||
        content.includes('async')
      ) {
        if (!content.includes('loading') && !content.includes('isLoading')) {
          issues.push({
            type: 'warning',
            category: 'ui-quality',
            message: 'Missing loading state for async operations',
            file: filePath,
            severity: 6,
            fix: 'Add a loading state: const [isLoading, setIsLoading] = useState(false);',
          });
          score -= 10;
        }
      }

      // Check for error handling UI
      if (content.includes('try {') || content.includes('catch')) {
        if (
          !content.includes('error') &&
          !content.includes('Error') &&
          !content.includes('setError')
        ) {
          issues.push({
            type: 'warning',
            category: 'ui-quality',
            message: 'Missing error state UI for error handling',
            file: filePath,
            severity: 5,
            fix: 'Add error state and display: {error && <ErrorMessage error={error} />}',
          });
          score -= 8;
        }
      }

      // Check for Tailwind usage (consistency)
      if (
        content.includes('className=') &&
        !content.includes('hover:') &&
        content.includes('button') &&
        content.includes('onClick')
      ) {
        issues.push({
          type: 'info',
          category: 'ui-quality',
          message: 'Interactive elements should have hover states',
          file: filePath,
          severity: 3,
          fix: 'Add hover styles: hover:bg-indigo-700 or hover:opacity-80',
        });
        score -= 5;
      }

      // Check for transition animations
      if (
        content.includes('hover:') &&
        !content.includes('transition') &&
        !content.includes('duration-')
      ) {
        issues.push({
          type: 'info',
          category: 'ui-quality',
          message: 'Add transition for smoother hover effects',
          file: filePath,
          severity: 2,
          fix: "Add 'transition-all duration-200' to enable smooth animations",
        });
        score -= 3;
      }

      // Check for dark mode support
      if (content.includes('bg-white') && !content.includes('dark:')) {
        issues.push({
          type: 'info',
          category: 'ui-quality',
          message: 'Consider adding dark mode support',
          file: filePath,
          severity: 3,
          fix: 'Add dark mode variants: bg-white dark:bg-gray-800',
        });
        score -= 5;
      }

      // Check for proper spacing
      if (content.includes('className=') && !content.includes('gap-') && !content.includes('space-')) {
        if (content.includes('flex') || content.includes('grid')) {
          issues.push({
            type: 'info',
            category: 'ui-quality',
            message: 'Flex/grid containers should use gap for consistent spacing',
            file: filePath,
            severity: 2,
            fix: 'Use gap-4 or space-y-4 for consistent spacing',
          });
          score -= 3;
        }
      }

      // Check for empty states
      if (
        (content.includes('.map(') || content.includes('forEach')) &&
        !content.includes('length === 0') &&
        !content.includes('.length > 0') &&
        !content.includes('No ') &&
        !content.includes('Empty')
      ) {
        issues.push({
          type: 'warning',
          category: 'ui-quality',
          message: 'Consider adding empty state for lists',
          file: filePath,
          severity: 4,
          fix: 'Add: {items.length === 0 && <EmptyState />}',
        });
        score -= 5;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Check accessibility compliance
   */
  private async checkAccessibility(
    files: Record<string, string>,
    issues: QualityIssue[]
  ): Promise<number> {
    if (!this.config.checkAccessibility) return 100;

    let score = 100;

    for (const [filePath, content] of Object.entries(files)) {
      // Skip non-component files
      if (!filePath.endsWith('.tsx') && !filePath.endsWith('.jsx')) {
        continue;
      }

      // Check for img alt attributes
      if (content.includes('<img') && !content.includes('alt=')) {
        issues.push({
          type: 'error',
          category: 'accessibility',
          message: 'Images must have alt attributes',
          file: filePath,
          severity: 8,
          fix: 'Add descriptive alt text: <img src="..." alt="Description of image" />',
        });
        score -= 15;
      }

      // Check for button accessibility
      if (content.includes('<button') && content.includes('onClick')) {
        // Check if button has accessible text or aria-label
        const buttonMatches = content.match(/<button[^>]*>/g) || [];
        for (const buttonTag of buttonMatches) {
          if (!buttonTag.includes('aria-label') && !content.includes('>{')) {
            // Button might only have icon
            if (content.includes('Icon') || content.includes('svg')) {
              issues.push({
                type: 'warning',
                category: 'accessibility',
                message: 'Icon-only buttons should have aria-label',
                file: filePath,
                severity: 6,
                fix: 'Add aria-label: <button aria-label="Close menu">',
              });
              score -= 8;
            }
          }
        }
      }

      // Check for form label associations
      if (content.includes('<input') && !content.includes('htmlFor') && !content.includes('aria-label')) {
        issues.push({
          type: 'warning',
          category: 'accessibility',
          message: 'Form inputs should have associated labels',
          file: filePath,
          severity: 6,
          fix: 'Use <label htmlFor="inputId">Label</label> or aria-label on input',
        });
        score -= 8;
      }

      // Check for focus management
      if (content.includes('Modal') || content.includes('Dialog')) {
        if (!content.includes('focus') && !content.includes('tabIndex')) {
          issues.push({
            type: 'info',
            category: 'accessibility',
            message: 'Modals should manage focus',
            file: filePath,
            severity: 4,
            fix: 'Add tabIndex={-1} and focus on open, trap focus within modal',
          });
          score -= 5;
        }
      }

      // Check for keyboard navigation
      if (content.includes('onClick') && !content.includes('onKeyDown') && !content.includes('onKeyPress')) {
        // Check if it's a div or span acting as a button
        if (content.includes('onClick={') && (content.includes('<div') || content.includes('<span'))) {
          issues.push({
            type: 'warning',
            category: 'accessibility',
            message: 'Clickable non-button elements need keyboard support',
            file: filePath,
            severity: 5,
            fix: 'Use <button> or add role="button" tabIndex={0} onKeyDown={...}',
          });
          score -= 7;
        }
      }

      // Check for ARIA roles
      if (content.includes('role=')) {
        // Positive check - has ARIA roles
        score += 2;
      }
    }

    return Math.max(0, Math.min(100, score));
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
    uiQualityScore: number;
    accessibilityScore: number;
  }): number {
    // Weighted average - UI quality and accessibility now more important for Lovable-quality
    const weights = {
      syntaxScore: 0.2,
      structureScore: 0.15,
      completenessScore: 0.15,
      bestPracticesScore: 0.15,
      performanceScore: 0.1,
      uiQualityScore: 0.15,
      accessibilityScore: 0.1,
    };

    return Math.round(
      scores.syntaxScore * weights.syntaxScore +
        scores.structureScore * weights.structureScore +
        scores.completenessScore * weights.completenessScore +
        scores.bestPracticesScore * weights.bestPracticesScore +
        scores.performanceScore * weights.performanceScore +
        scores.uiQualityScore * weights.uiQualityScore +
        scores.accessibilityScore * weights.accessibilityScore
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
      uiQualityScore: 100,
      accessibilityScore: 100,
      overallScore: 100,
      issues: [],
      suggestions: [],
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

/**
 * Additional quality checks for responsive design
 */
export function checkResponsiveDesign(content: string, filePath: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Skip non-component files
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.jsx')) {
    return issues;
  }

  // Check for responsive breakpoints usage
  const hasResponsiveClasses = /\b(sm:|md:|lg:|xl:|2xl:)/.test(content);
  const hasFlexOrGrid = /\b(flex|grid)\b/.test(content);

  if (hasFlexOrGrid && !hasResponsiveClasses) {
    issues.push({
      type: 'info',
      category: 'ui-quality',
      message: 'Layout uses flex/grid but no responsive breakpoints detected',
      file: filePath,
      severity: 3,
      fix: 'Add responsive breakpoints: grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    });
  }

  // Check for responsive text sizing
  if (content.includes('text-4xl') || content.includes('text-5xl') || content.includes('text-6xl')) {
    if (!content.includes('md:text-') && !content.includes('lg:text-')) {
      issues.push({
        type: 'info',
        category: 'ui-quality',
        message: 'Large text sizes should be responsive',
        file: filePath,
        severity: 2,
        fix: 'Use responsive text: text-2xl md:text-4xl lg:text-5xl',
      });
    }
  }

  // Check for responsive spacing
  if (content.includes('p-8') || content.includes('p-10') || content.includes('p-12')) {
    if (!content.includes('md:p-') && !content.includes('lg:p-')) {
      issues.push({
        type: 'info',
        category: 'ui-quality',
        message: 'Large padding values should be responsive',
        file: filePath,
        severity: 2,
        fix: 'Use responsive padding: p-4 md:p-8 lg:p-12',
      });
    }
  }

  // Check for fixed widths (potential overflow on mobile)
  const fixedWidthMatch = content.match(/w-\[(\d+)px\]/);
  if (fixedWidthMatch && parseInt(fixedWidthMatch[1]) > 300) {
    issues.push({
      type: 'warning',
      category: 'ui-quality',
      message: 'Fixed pixel widths may cause overflow on mobile',
      file: filePath,
      severity: 4,
      fix: 'Use max-w-full or responsive widths: w-full md:w-[500px]',
    });
  }

  // Check for proper container max-width
  if (content.includes('container') && !content.includes('max-w-')) {
    issues.push({
      type: 'info',
      category: 'ui-quality',
      message: 'Container should have max-width for large screens',
      file: filePath,
      severity: 2,
      fix: 'Add max-width: max-w-7xl mx-auto',
    });
  }

  return issues;
}

/**
 * Additional quality checks for TypeScript usage
 */
export function checkTypeScriptQuality(content: string, filePath: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Skip non-TypeScript files
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
    return issues;
  }

  // Check for 'any' type usage
  const anyMatches = content.match(/:\s*any\b/g);
  if (anyMatches && anyMatches.length > 0) {
    issues.push({
      type: 'warning',
      category: 'best-practice',
      message: `Found ${anyMatches.length} usage(s) of 'any' type - prefer specific types`,
      file: filePath,
      severity: 5,
      fix: "Replace 'any' with specific types, interfaces, or 'unknown' if truly unknown",
    });
  }

  // Check for missing return types on functions
  const funcWithoutReturnType = content.match(/(?:function|const)\s+\w+\s*=?\s*(?:async\s*)?\([^)]*\)\s*(?:=>)?\s*{/g);
  if (funcWithoutReturnType && funcWithoutReturnType.length > 2) {
    const hasReturnTypes = content.match(/\):\s*\w+/g);
    if (!hasReturnTypes || hasReturnTypes.length < funcWithoutReturnType.length / 2) {
      issues.push({
        type: 'info',
        category: 'best-practice',
        message: 'Functions should have explicit return types',
        file: filePath,
        severity: 2,
        fix: 'Add return types: function getData(): Promise<User[]> { ... }',
      });
    }
  }

  // Check for interface/type definitions
  if (filePath.includes('component') || filePath.endsWith('.tsx')) {
    const hasInterface = content.includes('interface ') || content.includes('type ');
    const hasProps = content.includes('Props') || content.includes('props:');

    if (!hasInterface && hasProps) {
      issues.push({
        type: 'warning',
        category: 'best-practice',
        message: 'Component props should be defined with an interface',
        file: filePath,
        severity: 4,
        fix: 'Define props interface: interface ButtonProps { onClick?: () => void; children: React.ReactNode; }',
      });
    }
  }

  // Check for non-null assertion abuse
  const nonNullAssertions = content.match(/!\./g);
  if (nonNullAssertions && nonNullAssertions.length > 3) {
    issues.push({
      type: 'warning',
      category: 'best-practice',
      message: 'Excessive non-null assertions (!.) - prefer proper null checks',
      file: filePath,
      severity: 4,
      fix: 'Use optional chaining (?.) or proper null checks instead of non-null assertion',
    });
  }

  // Check for proper event handler typing
  if (content.includes('onChange') || content.includes('onClick')) {
    if (!content.includes('React.') && !content.includes('ChangeEvent') && !content.includes('MouseEvent')) {
      issues.push({
        type: 'info',
        category: 'best-practice',
        message: 'Event handlers should be properly typed',
        file: filePath,
        severity: 2,
        fix: 'Type event: (e: React.ChangeEvent<HTMLInputElement>) => void',
      });
    }
  }

  return issues;
}

/**
 * Additional quality checks for security
 */
export function checkSecurityPatterns(content: string, filePath: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Check for dangerouslySetInnerHTML
  if (content.includes('dangerouslySetInnerHTML')) {
    issues.push({
      type: 'warning',
      category: 'security',
      message: 'dangerouslySetInnerHTML can expose XSS vulnerabilities',
      file: filePath,
      severity: 7,
      fix: 'Sanitize HTML with DOMPurify or avoid innerHTML entirely',
    });
  }

  // Check for eval usage
  if (content.includes('eval(') || content.includes('new Function(')) {
    issues.push({
      type: 'error',
      category: 'security',
      message: 'eval() and new Function() are security risks',
      file: filePath,
      severity: 9,
      fix: 'Avoid eval - use safer alternatives like JSON.parse for data',
    });
  }

  // Check for exposed API keys
  const apiKeyPatterns = [
    /api[_-]?key\s*[=:]\s*['"][^'"]+['"]/i,
    /secret[_-]?key\s*[=:]\s*['"][^'"]+['"]/i,
    /password\s*[=:]\s*['"][^'"]+['"]/i,
  ];

  for (const pattern of apiKeyPatterns) {
    if (pattern.test(content)) {
      issues.push({
        type: 'error',
        category: 'security',
        message: 'Potential hardcoded secret/API key detected',
        file: filePath,
        severity: 10,
        fix: 'Move secrets to environment variables: process.env.API_KEY',
      });
      break;
    }
  }

  // Check for unvalidated user input
  if (content.includes('window.location') && content.includes('=')) {
    issues.push({
      type: 'warning',
      category: 'security',
      message: 'Modifying window.location with user input can enable open redirects',
      file: filePath,
      severity: 6,
      fix: 'Validate URLs against allowlist before redirecting',
    });
  }

  // Check for missing input sanitization in forms
  if (content.includes('<input') && content.includes('value={') && !content.includes('sanitize')) {
    if (content.includes('innerHTML') || content.includes('__html')) {
      issues.push({
        type: 'warning',
        category: 'security',
        message: 'Form input rendered as HTML without sanitization',
        file: filePath,
        severity: 7,
        fix: 'Sanitize user input before rendering as HTML',
      });
    }
  }

  return issues;
}

/**
 * Check for common anti-patterns
 */
export function checkAntiPatterns(content: string, filePath: string): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Check for inline styles (prefer Tailwind)
  const inlineStyleMatches = content.match(/style=\{\{[^}]+\}\}/g);
  if (inlineStyleMatches && inlineStyleMatches.length > 2) {
    issues.push({
      type: 'info',
      category: 'best-practice',
      message: 'Prefer Tailwind classes over inline styles',
      file: filePath,
      severity: 2,
      fix: 'Replace style={{ color: "red" }} with className="text-red-500"',
    });
  }

  // Check for array index as key
  if (content.includes('.map(') && content.includes('key={i}') || content.includes('key={index}')) {
    issues.push({
      type: 'warning',
      category: 'best-practice',
      message: 'Using array index as React key can cause issues with reordering',
      file: filePath,
      severity: 5,
      fix: 'Use unique identifier: key={item.id} instead of key={index}',
    });
  }

  // Check for missing key prop
  if (content.includes('.map(') && !content.includes('key=')) {
    issues.push({
      type: 'error',
      category: 'best-practice',
      message: 'Missing key prop in list rendering',
      file: filePath,
      severity: 7,
      fix: 'Add key prop: {items.map(item => <Item key={item.id} />)}',
    });
  }

  // Check for useState with objects that could be useReducer
  const useStateMatches = content.match(/useState\s*<[^>]*>/g);
  if (useStateMatches && useStateMatches.length > 5) {
    issues.push({
      type: 'info',
      category: 'best-practice',
      message: 'Multiple related useState calls might be better as useReducer',
      file: filePath,
      severity: 2,
      fix: 'Consider useReducer for complex state logic',
    });
  }

  // Check for nested ternaries
  const nestedTernary = content.match(/\?\s*[^:]+\s*:\s*[^?]+\?\s*[^:]+\s*:/);
  if (nestedTernary) {
    issues.push({
      type: 'warning',
      category: 'best-practice',
      message: 'Nested ternary operators reduce readability',
      file: filePath,
      severity: 4,
      fix: 'Extract nested ternaries into separate variables or use if/else',
    });
  }

  // Check for useEffect without cleanup
  if (content.includes('useEffect') && content.includes('addEventListener')) {
    if (!content.includes('removeEventListener')) {
      issues.push({
        type: 'warning',
        category: 'best-practice',
        message: 'Event listener added in useEffect without cleanup',
        file: filePath,
        severity: 6,
        fix: 'Return cleanup function: return () => window.removeEventListener(...)',
      });
    }
  }

  return issues;
}

/**
 * Combined quality check runner
 */
export function runAllQualityChecks(
  files: Record<string, string>
): { issues: QualityIssue[]; score: number } {
  const allIssues: QualityIssue[] = [];

  for (const [filePath, content] of Object.entries(files)) {
    allIssues.push(...checkResponsiveDesign(content, filePath));
    allIssues.push(...checkTypeScriptQuality(content, filePath));
    allIssues.push(...checkSecurityPatterns(content, filePath));
    allIssues.push(...checkAntiPatterns(content, filePath));
  }

  // Calculate score based on issues
  let score = 100;
  for (const issue of allIssues) {
    switch (issue.type) {
      case 'error':
        score -= issue.severity * 2;
        break;
      case 'warning':
        score -= issue.severity;
        break;
      case 'info':
        score -= issue.severity * 0.5;
        break;
    }
  }

  return {
    issues: allIssues,
    score: Math.max(0, Math.min(100, score)),
  };
}