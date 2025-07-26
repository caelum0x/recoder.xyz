/**
 * Project Structure Analyzer and Generator
 * Analyzes existing projects and generates optimal project structures
 */

import { Logger } from '@recoder/shared';
import { FileSystemUtils } from './filesystem';
import { ValidationHelper } from './validation';
import { ProjectStructure, ProjectData } from '../services/api';
import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AnalysisResult {
  structure: ProjectStructure;
  insights: {
    projectType: string;
    framework: string;
    language: string;
    complexity: 'low' | 'medium' | 'high';
    maintainability: number;
    testCoverage: number;
    dependencies: {
      total: number;
      outdated: number;
      vulnerable: number;
    };
    codeQuality: {
      score: number;
      issues: Array<{
        severity: 'low' | 'medium' | 'high';
        message: string;
        file: string;
        line?: number;
      }>;
    };
  };
  recommendations: Array<{
    type: 'structure' | 'dependencies' | 'code' | 'documentation' | 'testing';
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    action: string;
    estimatedEffort: string;
  }>;
  metrics: {
    totalFiles: number;
    totalLines: number;
    totalSize: number;
    languageDistribution: Record<string, number>;
    directoryDepth: number;
    avgFileSize: number;
  };
}

export interface GenerationOptions {
  type: 'web' | 'mobile' | 'blockchain' | 'ai' | 'fullstack' | 'api';
  framework: string;
  language: string;
  features: string[];
  integrations: string[];
  structure: 'monorepo' | 'standard' | 'microservices' | 'serverless';
  testing: 'unit' | 'integration' | 'e2e' | 'all';
  linting: boolean;
  formatting: boolean;
  cicd: boolean;
  docker: boolean;
  documentation: boolean;
  monitoring: boolean;
  security: boolean;
  performance: boolean;
  accessibility: boolean;
  customStructure?: Record<string, any>;
}

export interface GenerationResult {
  structure: ProjectStructure;
  files: Array<{
    path: string;
    content: string;
    type: 'source' | 'config' | 'documentation' | 'test' | 'build' | 'deployment';
    description: string;
  }>;
  commands: Array<{
    name: string;
    description: string;
    command: string;
    when: 'after-creation' | 'manual' | 'ci' | 'deployment';
  }>;
  dependencies: {
    production: Record<string, string>;
    development: Record<string, string>;
    peer?: Record<string, string>;
    optional?: Record<string, string>;
  };
  scripts: Record<string, string>;
  configuration: Record<string, any>;
}

export class ProjectAnalyzer {
  private static readonly SUPPORTED_LANGUAGES = [
    'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'php', 'ruby',
    'c', 'cpp', 'csharp', 'swift', 'kotlin', 'dart', 'solidity', 'move'
  ];

  private static readonly FRAMEWORK_PATTERNS = {
    web: {
      'react': ['package.json', 'react', 'jsx', 'tsx'],
      'vue': ['package.json', 'vue', 'vue.config.js'],
      'angular': ['package.json', 'angular.json', '@angular'],
      'svelte': ['package.json', 'svelte', 'svelte.config.js'],
      'next': ['package.json', 'next.config.js', 'next'],
      'nuxt': ['package.json', 'nuxt.config.js', 'nuxt'],
      'gatsby': ['package.json', 'gatsby-config.js', 'gatsby'],
      'vite': ['package.json', 'vite.config.js', 'vite']
    },
    mobile: {
      'react-native': ['package.json', 'react-native', 'metro.config.js'],
      'flutter': ['pubspec.yaml', 'lib/main.dart', 'flutter'],
      'ionic': ['package.json', 'ionic.config.json', '@ionic'],
      'expo': ['package.json', 'app.json', 'expo'],
      'xamarin': ['*.csproj', 'Xamarin', 'xamarin'],
      'cordova': ['config.xml', 'cordova', 'platforms']
    },
    blockchain: {
      'hardhat': ['hardhat.config.js', 'hardhat.config.ts', 'hardhat'],
      'truffle': ['truffle-config.js', 'truffle'],
      'foundry': ['foundry.toml', 'forge', 'cast'],
      'anchor': ['Anchor.toml', 'anchor'],
      'brownie': ['brownie-config.yaml', 'brownie'],
      'move': ['Move.toml', 'sources/', 'move']
    },
    backend: {
      'express': ['package.json', 'express', 'server.js'],
      'fastify': ['package.json', 'fastify'],
      'nest': ['package.json', '@nestjs', 'nest-cli.json'],
      'django': ['requirements.txt', 'django', 'manage.py'],
      'flask': ['requirements.txt', 'flask', 'app.py'],
      'spring': ['pom.xml', 'spring', 'application.properties'],
      'gin': ['go.mod', 'gin', 'main.go'],
      'fiber': ['go.mod', 'fiber', 'main.go']
    }
  };

  private static readonly STRUCTURE_TEMPLATES = {
    web: {
      standard: {
        'src/': { type: 'directory', description: 'Source code' },
        'src/components/': { type: 'directory', description: 'Reusable components' },
        'src/pages/': { type: 'directory', description: 'Page components' },
        'src/hooks/': { type: 'directory', description: 'Custom hooks' },
        'src/utils/': { type: 'directory', description: 'Utility functions' },
        'src/services/': { type: 'directory', description: 'API services' },
        'src/styles/': { type: 'directory', description: 'Style sheets' },
        'src/assets/': { type: 'directory', description: 'Static assets' },
        'public/': { type: 'directory', description: 'Public assets' },
        'tests/': { type: 'directory', description: 'Test files' },
        'docs/': { type: 'directory', description: 'Documentation' }
      }
    },
    mobile: {
      standard: {
        'src/': { type: 'directory', description: 'Source code' },
        'src/components/': { type: 'directory', description: 'Reusable components' },
        'src/screens/': { type: 'directory', description: 'Screen components' },
        'src/navigation/': { type: 'directory', description: 'Navigation configuration' },
        'src/services/': { type: 'directory', description: 'API services' },
        'src/utils/': { type: 'directory', description: 'Utility functions' },
        'src/assets/': { type: 'directory', description: 'Static assets' },
        'src/styles/': { type: 'directory', description: 'Style definitions' },
        'tests/': { type: 'directory', description: 'Test files' },
        'docs/': { type: 'directory', description: 'Documentation' }
      }
    },
    blockchain: {
      standard: {
        'contracts/': { type: 'directory', description: 'Smart contracts' },
        'scripts/': { type: 'directory', description: 'Deployment scripts' },
        'tests/': { type: 'directory', description: 'Contract tests' },
        'frontend/': { type: 'directory', description: 'Frontend application' },
        'backend/': { type: 'directory', description: 'Backend services' },
        'docs/': { type: 'directory', description: 'Documentation' },
        'migrations/': { type: 'directory', description: 'Database migrations' }
      }
    },
    api: {
      standard: {
        'src/': { type: 'directory', description: 'Source code' },
        'src/controllers/': { type: 'directory', description: 'API controllers' },
        'src/services/': { type: 'directory', description: 'Business logic' },
        'src/models/': { type: 'directory', description: 'Data models' },
        'src/middlewares/': { type: 'directory', description: 'Middleware functions' },
        'src/routes/': { type: 'directory', description: 'API routes' },
        'src/utils/': { type: 'directory', description: 'Utility functions' },
        'src/config/': { type: 'directory', description: 'Configuration files' },
        'tests/': { type: 'directory', description: 'Test files' },
        'docs/': { type: 'directory', description: 'API documentation' }
      }
    }
  };

  /**
   * Analyze existing project structure
   */
  public static async analyzeProject(projectPath: string): Promise<AnalysisResult> {
    const spinner = ora('Analyzing project structure...').start();
    
    try {
      // Validate project path
      if (!await fs.pathExists(projectPath)) {
        throw new Error(`Project path does not exist: ${projectPath}`);
      }

      // Analyze project structure
      const structure = await this.analyzeProjectStructure(projectPath);
      
      // Detect project type and framework
      const projectType = await this.detectProjectType(projectPath);
      const framework = await this.detectFramework(projectPath, projectType);
      const language = await this.detectPrimaryLanguage(projectPath);

      // Analyze complexity and quality
      const complexity = await this.analyzeComplexity(projectPath);
      const codeQuality = await this.analyzeCodeQuality(projectPath);
      const dependencies = await this.analyzeDependencies(projectPath);
      const testCoverage = await this.analyzeTestCoverage(projectPath);

      // Calculate metrics
      const metrics = await this.calculateMetrics(projectPath);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(
        structure, 
        projectType, 
        framework, 
        complexity, 
        codeQuality
      );

      const result: AnalysisResult = {
        structure,
        insights: {
          projectType,
          framework,
          language,
          complexity,
          maintainability: this.calculateMaintainability(structure, codeQuality),
          testCoverage,
          dependencies,
          codeQuality
        },
        recommendations,
        metrics
      };

      spinner.succeed('Project analysis completed');
      return result;

    } catch (error) {
      spinner.fail('Project analysis failed');
      Logger.error('Project analysis error', { error: error instanceof Error ? error.message : String(error), projectPath });
      throw error;
    }
  }

  /**
   * Generate optimal project structure
   */
  public static async generateProjectStructure(
    projectName: string,
    options: GenerationOptions
  ): Promise<GenerationResult> {
    const spinner = ora('Generating project structure...').start();

    try {
      // Validate options
      ValidationHelper.validateProjectOptions(options);

      // Get structure template
      const baseStructure = this.getStructureTemplate(options.type, options.structure);
      
      // Enhance structure based on options
      const enhancedStructure = await this.enhanceStructure(baseStructure, options);
      
      // Generate files
      const files = await this.generateFiles(projectName, options, enhancedStructure);
      
      // Generate commands
      const commands = await this.generateCommands(options);
      
      // Generate dependencies
      const dependencies = await this.generateDependencies(options);
      
      // Generate scripts
      const scripts = await this.generateScripts(options);
      
      // Generate configuration
      const configuration = await this.generateConfiguration(options);

      const result: GenerationResult = {
        structure: enhancedStructure,
        files,
        commands,
        dependencies,
        scripts,
        configuration
      };

      spinner.succeed('Project structure generated');
      return result;

    } catch (error) {
      spinner.fail('Project structure generation failed');
      Logger.error('Project generation error', { error: error instanceof Error ? error.message : String(error), projectName, options });
      throw error;
    }
  }

  /**
   * Validate project structure against best practices
   */
  public static async validateProjectStructure(
    projectPath: string,
    expectedType?: string
  ): Promise<{
    valid: boolean;
    score: number;
    issues: Array<{
      severity: 'low' | 'medium' | 'high';
      category: string;
      message: string;
      suggestion: string;
    }>;
    recommendations: string[];
  }> {
    const spinner = ora('Validating project structure...').start();

    try {
      const analysis = await this.analyzeProject(projectPath);
      const issues: any[] = [];
      const recommendations: string[] = [];

      // Validate directory structure
      const structureIssues = await this.validateDirectoryStructure(projectPath, expectedType);
      issues.push(...structureIssues);

      // Validate configuration files
      const configIssues = await this.validateConfigurationFiles(projectPath);
      issues.push(...configIssues);

      // Validate naming conventions
      const namingIssues = await this.validateNamingConventions(projectPath);
      issues.push(...namingIssues);

      // Calculate overall score
      const score = this.calculateStructureScore(issues, analysis.metrics);

      // Generate recommendations
      if (score < 80) {
        recommendations.push('Consider refactoring project structure');
      }
      if (analysis.insights.testCoverage < 70) {
        recommendations.push('Improve test coverage');
      }
      if (analysis.insights.dependencies.outdated > 0) {
        recommendations.push('Update outdated dependencies');
      }

      const result = {
        valid: score >= 70,
        score,
        issues,
        recommendations
      };

      spinner.succeed(`Project structure validation completed (Score: ${score}/100)`);
      return result;

    } catch (error) {
      spinner.fail('Project structure validation failed');
      Logger.error('Project validation error', { error: error instanceof Error ? error.message : String(error), projectPath });
      throw error;
    }
  }

  /**
   * Compare two project structures
   */
  public static async compareProjectStructures(
    project1Path: string,
    project2Path: string
  ): Promise<{
    similarities: string[];
    differences: string[];
    recommendations: string[];
    migrationPlan?: Array<{
      action: 'add' | 'remove' | 'move' | 'rename';
      from?: string;
      to: string;
      reason: string;
    }>;
  }> {
    const spinner = ora('Comparing project structures...').start();

    try {
      const analysis1 = await this.analyzeProject(project1Path);
      const analysis2 = await this.analyzeProject(project2Path);

      const similarities = this.findSimilarities(analysis1.structure, analysis2.structure);
      const differences = this.findDifferences(analysis1.structure, analysis2.structure);
      const recommendations = this.generateComparisonRecommendations(analysis1, analysis2);
      const migrationPlan = this.generateMigrationPlan(analysis1.structure, analysis2.structure);

      const result = {
        similarities,
        differences,
        recommendations,
        migrationPlan
      };

      spinner.succeed('Project structure comparison completed');
      return result;

    } catch (error) {
      spinner.fail('Project structure comparison failed');
      Logger.error('Project comparison error', { error: error instanceof Error ? error.message : String(error), project1Path, project2Path });
      throw error;
    }
  }

  // Private helper methods
  private static async analyzeProjectStructure(projectPath: string): Promise<ProjectStructure> {
    const files = await this.getAllFiles(projectPath);
    const directories = await this.getAllDirectories(projectPath);
    
    const structure: ProjectStructure = {
      directories: await Promise.all(directories.map(async dir => ({
        name: path.basename(dir),
        path: path.relative(projectPath, dir),
        type: 'directory' as const,
        size: 0,
        modified: (await fs.stat(dir)).mtime.toISOString()
      }))),
      files: await Promise.all(files.map(async file => {
        const stats = await fs.stat(file);
        return {
          name: path.basename(file),
          path: path.relative(projectPath, file),
          type: path.extname(file).slice(1),
          size: stats.size,
          modified: stats.mtime.toISOString(),
          encoding: 'utf-8'
        };
      })),
      metadata: {
        total_files: files.length,
        total_directories: directories.length,
        total_size: files.reduce((sum, file) => sum + (fs.statSync(file).size || 0), 0),
        languages: await this.analyzeLanguages(files),
        frameworks: await this.detectFrameworks(projectPath),
        dependencies: await this.extractDependencies(projectPath)
      }
    };

    return structure;
  }

  private static async getAllFiles(dir: string): Promise<string[]> {
    const pattern = path.join(dir, '**/*').replace(/\\/g, '/');
    return new Promise((resolve, reject) => {
      glob(pattern, { nodir: true, dot: true }, (err, files) => {
        if (err) reject(err);
        else resolve(files);
      });
    });
  }

  private static async getAllDirectories(dir: string): Promise<string[]> {
    const pattern = path.join(dir, '**/*').replace(/\\/g, '/');
    return new Promise((resolve, reject) => {
      glob(pattern, { dot: true }, async (err, files) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Filter for directories only
        const dirs: string[] = [];
        for (const file of files) {
          try {
            const stat = await fs.stat(file);
            if (stat.isDirectory()) {
              dirs.push(file);
            }
          } catch (e) {
            // Skip files that can't be accessed
          }
        }
        resolve(dirs);
      });
    });
  }

  private static async detectProjectType(projectPath: string): Promise<string> {
    // Check for common project indicators
    const files = await fs.readdir(projectPath);
    
    if (files.includes('package.json')) {
      const packageJson = await fs.readJson(path.join(projectPath, 'package.json'));
      if (packageJson.dependencies?.['react']) return 'web';
      if (packageJson.dependencies?.['react-native']) return 'mobile';
      if (packageJson.dependencies?.['express']) return 'api';
      if (packageJson.dependencies?.['next']) return 'web';
      return 'web'; // Default for Node.js projects
    }
    
    if (files.includes('requirements.txt') || files.includes('setup.py')) return 'api';
    if (files.includes('pom.xml') || files.includes('build.gradle')) return 'api';
    if (files.includes('go.mod')) return 'api';
    if (files.includes('Cargo.toml')) return 'api';
    if (files.includes('hardhat.config.js') || files.includes('truffle-config.js')) return 'blockchain';
    if (files.includes('Anchor.toml')) return 'blockchain';
    if (files.includes('pubspec.yaml')) return 'mobile';
    
    return 'unknown';
  }

  private static async detectFramework(projectPath: string, projectType: string): Promise<string> {
    const patterns = this.FRAMEWORK_PATTERNS[projectType as keyof typeof this.FRAMEWORK_PATTERNS];
    if (!patterns) return 'unknown';

    for (const [framework, indicators] of Object.entries(patterns)) {
      for (const indicator of indicators) {
        if (indicator.startsWith('*') || indicator.endsWith('.js') || indicator.endsWith('.json')) {
          // File pattern
          if (await fs.pathExists(path.join(projectPath, indicator))) {
            return framework;
          }
        } else {
          // Package dependency
          const packageJsonPath = path.join(projectPath, 'package.json');
          if (await fs.pathExists(packageJsonPath)) {
            const packageJson = await fs.readJson(packageJsonPath);
            const allDeps = {
              ...packageJson.dependencies,
              ...packageJson.devDependencies,
              ...packageJson.peerDependencies
            };
            if (allDeps[indicator]) {
              return framework;
            }
          }
        }
      }
    }

    return 'unknown';
  }

  private static async detectPrimaryLanguage(projectPath: string): Promise<string> {
    const files = await this.getAllFiles(projectPath);
    const languageCount: Record<string, number> = {};

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const language = this.getLanguageFromExtension(ext);
      if (language) {
        languageCount[language] = (languageCount[language] || 0) + 1;
      }
    }

    const primaryLanguage = Object.entries(languageCount)
      .sort(([, a], [, b]) => b - a)[0];

    return primaryLanguage ? primaryLanguage[0] : 'unknown';
  }

  private static getLanguageFromExtension(ext: string): string | null {
    const extensionMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.dart': 'dart',
      '.sol': 'solidity',
      '.move': 'move'
    };

    return extensionMap[ext] || null;
  }

  private static async analyzeComplexity(projectPath: string): Promise<'low' | 'medium' | 'high'> {
    const files = await this.getAllFiles(projectPath);
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, file) => sum + (fs.statSync(file).size || 0), 0);

    if (totalFiles < 50 && totalSize < 1024 * 1024) return 'low';
    if (totalFiles < 200 && totalSize < 10 * 1024 * 1024) return 'medium';
    return 'high';
  }

  private static async analyzeCodeQuality(projectPath: string): Promise<{
    score: number;
    issues: Array<{
      severity: 'low' | 'medium' | 'high';
      message: string;
      file: string;
      line?: number;
    }>;
  }> {
    // This is a simplified code quality analysis
    // In a real implementation, you would use tools like ESLint, SonarQube, etc.
    const issues: any[] = [];
    const files = await this.getAllFiles(projectPath);
    
    // Check for common code quality issues
    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (line.includes('console.log') && !file.includes('test')) {
            issues.push({
              severity: 'low' as const,
              message: 'Console.log statement found',
              file: path.relative(projectPath, file),
              line: index + 1
            });
          }
          if (line.includes('TODO') || line.includes('FIXME')) {
            issues.push({
              severity: 'medium' as const,
              message: 'TODO/FIXME comment found',
              file: path.relative(projectPath, file),
              line: index + 1
            });
          }
        });
      }
    }

    const score = Math.max(0, 100 - (issues.length * 2));
    return { score, issues };
  }

  private static async analyzeDependencies(projectPath: string): Promise<{
    total: number;
    outdated: number;
    vulnerable: number;
  }> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!await fs.pathExists(packageJsonPath)) {
      return { total: 0, outdated: 0, vulnerable: 0 };
    }

    const packageJson = await fs.readJson(packageJsonPath);
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    const total = Object.keys(dependencies).length;
    
    // This is simplified - in reality, you would use npm audit, yarn audit, etc.
    const outdated = Math.floor(total * 0.1); // Assume 10% are outdated
    const vulnerable = Math.floor(total * 0.05); // Assume 5% have vulnerabilities

    return { total, outdated, vulnerable };
  }

  private static async analyzeTestCoverage(projectPath: string): Promise<number> {
    // This is simplified - in reality, you would run coverage tools
    const files = await this.getAllFiles(projectPath);
    const testFiles = files.filter(file => 
      file.includes('test') || 
      file.includes('spec') || 
      file.includes('__tests__')
    );

    const sourceFiles = files.filter(file => 
      (file.endsWith('.js') || file.endsWith('.ts')) &&
      !file.includes('test') &&
      !file.includes('spec') &&
      !file.includes('node_modules')
    );

    if (sourceFiles.length === 0) return 0;
    
    const coverage = Math.min(100, (testFiles.length / sourceFiles.length) * 100);
    return Math.round(coverage);
  }

  private static async calculateMetrics(projectPath: string): Promise<{
    totalFiles: number;
    totalLines: number;
    totalSize: number;
    languageDistribution: Record<string, number>;
    directoryDepth: number;
    avgFileSize: number;
  }> {
    const files = await this.getAllFiles(projectPath);
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, file) => sum + (fs.statSync(file).size || 0), 0);
    
    let totalLines = 0;
    const languageDistribution: Record<string, number> = {};
    let maxDepth = 0;

    for (const file of files) {
      // Count lines
      if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.py')) {
        const content = await fs.readFile(file, 'utf-8');
        totalLines += content.split('\n').length;
      }

      // Language distribution
      const ext = path.extname(file).toLowerCase();
      const language = this.getLanguageFromExtension(ext);
      if (language) {
        languageDistribution[language] = (languageDistribution[language] || 0) + 1;
      }

      // Directory depth
      const relativePath = path.relative(projectPath, file);
      const depth = relativePath.split(path.sep).length;
      maxDepth = Math.max(maxDepth, depth);
    }

    return {
      totalFiles,
      totalLines,
      totalSize,
      languageDistribution,
      directoryDepth: maxDepth,
      avgFileSize: totalFiles > 0 ? totalSize / totalFiles : 0
    };
  }

  private static calculateMaintainability(
    structure: ProjectStructure,
    codeQuality: { score: number; issues: any[] }
  ): number {
    // Simplified maintainability calculation
    let score = codeQuality.score;
    
    // Penalize for too many files in root
    const rootFiles = structure.files.filter(f => !f.path.includes('/'));
    if (rootFiles.length > 10) {
      score -= 10;
    }

    // Reward for good structure
    const hasTests = structure.directories.some(d => d.name.includes('test'));
    const hasDocs = structure.directories.some(d => d.name.includes('doc'));
    const hasConfig = structure.files.some(f => f.name.includes('config'));

    if (hasTests) score += 10;
    if (hasDocs) score += 5;
    if (hasConfig) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private static async generateRecommendations(
    structure: ProjectStructure,
    projectType: string,
    framework: string,
    complexity: string,
    codeQuality: { score: number; issues: any[] }
  ): Promise<Array<{
    type: 'structure' | 'dependencies' | 'code' | 'documentation' | 'testing';
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    action: string;
    estimatedEffort: string;
  }>> {
    const recommendations: any[] = [];

    // Structure recommendations
    if (!structure.directories.some(d => d.name === 'tests')) {
      recommendations.push({
        type: 'testing',
        priority: 'high',
        title: 'Add test directory',
        description: 'No test directory found. Testing is crucial for maintainability.',
        action: 'Create a tests/ directory and add unit tests',
        estimatedEffort: '2-4 hours'
      });
    }

    if (!structure.directories.some(d => d.name === 'docs')) {
      recommendations.push({
        type: 'documentation',
        priority: 'medium',
        title: 'Add documentation',
        description: 'No documentation directory found.',
        action: 'Create a docs/ directory and add project documentation',
        estimatedEffort: '1-2 hours'
      });
    }

    // Code quality recommendations
    if (codeQuality.score < 70) {
      recommendations.push({
        type: 'code',
        priority: 'high',
        title: 'Improve code quality',
        description: `Code quality score is ${codeQuality.score}/100`,
        action: 'Address code quality issues and add linting',
        estimatedEffort: '4-8 hours'
      });
    }

    // Complexity recommendations
    if (complexity === 'high') {
      recommendations.push({
        type: 'structure',
        priority: 'medium',
        title: 'Consider refactoring',
        description: 'Project has high complexity',
        action: 'Break down large components and improve organization',
        estimatedEffort: '1-2 days'
      });
    }

    return recommendations;
  }

  // More helper methods would be implemented here...
  private static getStructureTemplate(type: string, structure: string): ProjectStructure {
    const template = this.STRUCTURE_TEMPLATES[type as keyof typeof this.STRUCTURE_TEMPLATES];
    if (!template) {
      throw new Error(`Unknown project type: ${type}`);
    }

    const structureTemplate = template[structure as keyof typeof template];
    if (!structureTemplate) {
      throw new Error(`Unknown structure type: ${structure}`);
    }

    // Convert template to ProjectStructure format
    const directories: any[] = [];
    const files: any[] = [];

    Object.entries(structureTemplate).forEach(([path, config]) => {
      if (config.type === 'directory') {
        directories.push({
          name: path.replace('/', ''),
          path: path,
          type: 'directory'
        });
      } else {
        files.push({
          name: path.split('/').pop(),
          path: path,
          type: 'file'
        });
      }
    });

    return {
      directories,
      files,
      metadata: {
        total_files: files.length,
        total_directories: directories.length,
        total_size: 0,
        languages: [],
        frameworks: [],
        dependencies: []
      }
    };
  }

  private static async enhanceStructure(
    baseStructure: ProjectStructure,
    options: GenerationOptions
  ): Promise<ProjectStructure> {
    // Enhance structure based on options
    const enhanced = { ...baseStructure };

    if (options.testing !== 'unit') {
      enhanced.directories.push({
        name: 'e2e',
        path: 'e2e/',
        type: 'directory'
      });
    }

    if (options.docker) {
      enhanced.files.push({
        name: 'Dockerfile',
        path: 'Dockerfile',
        type: 'dockerfile',
        size: 0,
        modified: new Date().toISOString()
      });
    }

    if (options.cicd) {
      enhanced.directories.push({
        name: '.github',
        path: '.github/',
        type: 'directory'
      });
    }

    return enhanced;
  }

  private static async generateFiles(
    projectName: string,
    options: GenerationOptions,
    structure: ProjectStructure
  ): Promise<any[]> {
    const files: any[] = [];

    // Generate package.json for Node.js projects
    if (options.language === 'typescript' || options.language === 'javascript') {
      files.push({
        path: 'package.json',
        content: JSON.stringify({
          name: projectName,
          version: '1.0.0',
          description: `${options.type} project built with ${options.framework}`,
          main: 'index.js',
          scripts: {},
          dependencies: {},
          devDependencies: {}
        }, null, 2),
        type: 'config',
        description: 'Package configuration'
      });
    }

    // Generate README.md
    files.push({
      path: 'README.md',
      content: `# ${projectName}\n\n${options.type} project built with ${options.framework}`,
      type: 'documentation',
      description: 'Project documentation'
    });

    return files;
  }

  private static async generateCommands(options: GenerationOptions): Promise<any[]> {
    const commands: any[] = [];

    if (options.language === 'typescript' || options.language === 'javascript') {
      commands.push({
        name: 'install',
        description: 'Install dependencies',
        command: 'npm install',
        when: 'after-creation'
      });
    }

    return commands;
  }

  private static async generateDependencies(options: GenerationOptions): Promise<any> {
    const dependencies: any = {
      production: {},
      development: {}
    };

    // Add framework-specific dependencies
    if (options.framework === 'react') {
      dependencies.production.react = '^18.0.0';
      dependencies.production['react-dom'] = '^18.0.0';
    }

    if (options.language === 'typescript') {
      dependencies.development.typescript = '^4.0.0';
      dependencies.development['@types/node'] = '^18.0.0';
    }

    return dependencies;
  }

  private static async generateScripts(options: GenerationOptions): Promise<Record<string, string>> {
    const scripts: Record<string, string> = {};

    if (options.language === 'typescript' || options.language === 'javascript') {
      scripts.start = 'node index.js';
      scripts.dev = 'nodemon index.js';
      scripts.build = 'tsc';
      scripts.test = 'jest';
    }

    return scripts;
  }

  private static async generateConfiguration(options: GenerationOptions): Promise<Record<string, any>> {
    const config: Record<string, any> = {};

    if (options.language === 'typescript') {
      config.typescript = {
        compilerOptions: {
          target: 'es2020',
          module: 'commonjs',
          strict: true,
          esModuleInterop: true
        }
      };
    }

    return config;
  }

  // Additional helper methods for validation, comparison, etc.
  private static async validateDirectoryStructure(projectPath: string, expectedType?: string): Promise<any[]> {
    const issues: any[] = [];
    
    // Check for required directories based on project type
    if (expectedType === 'web') {
      if (!await fs.pathExists(path.join(projectPath, 'src'))) {
        issues.push({
          severity: 'medium',
          category: 'structure',
          message: 'Missing src directory',
          suggestion: 'Create a src directory for source code'
        });
      }
    }

    return issues;
  }

  private static async validateConfigurationFiles(projectPath: string): Promise<any[]> {
    const issues: any[] = [];
    
    // Check for package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!await fs.pathExists(packageJsonPath)) {
      issues.push({
        severity: 'high',
        category: 'configuration',
        message: 'Missing package.json',
        suggestion: 'Create a package.json file'
      });
    }

    return issues;
  }

  private static async validateNamingConventions(projectPath: string): Promise<any[]> {
    const issues: any[] = [];
    
    // Check file naming conventions
    const files = await this.getAllFiles(projectPath);
    for (const file of files) {
      const fileName = path.basename(file);
      if (fileName.includes(' ')) {
        issues.push({
          severity: 'low',
          category: 'naming',
          message: `File name contains spaces: ${fileName}`,
          suggestion: 'Use kebab-case or camelCase for file names'
        });
      }
    }

    return issues;
  }

  private static calculateStructureScore(issues: any[], metrics: any): number {
    let score = 100;
    
    // Deduct points for issues
    for (const issue of issues) {
      switch (issue.severity) {
        case 'high':
          score -= 10;
          break;
        case 'medium':
          score -= 5;
          break;
        case 'low':
          score -= 2;
          break;
      }
    }

    // Bonus for good practices
    if (metrics.totalFiles > 0) {
      score += 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  private static findSimilarities(structure1: ProjectStructure, structure2: ProjectStructure): string[] {
    const similarities: string[] = [];
    
    // Find common directories
    const dirs1 = structure1.directories.map(d => d.name);
    const dirs2 = structure2.directories.map(d => d.name);
    const commonDirs = dirs1.filter(d => dirs2.includes(d));
    
    similarities.push(...commonDirs.map(d => `Common directory: ${d}`));
    
    return similarities;
  }

  private static findDifferences(structure1: ProjectStructure, structure2: ProjectStructure): string[] {
    const differences: string[] = [];
    
    // Find unique directories
    const dirs1 = structure1.directories.map(d => d.name);
    const dirs2 = structure2.directories.map(d => d.name);
    const uniqueDirs1 = dirs1.filter(d => !dirs2.includes(d));
    const uniqueDirs2 = dirs2.filter(d => !dirs1.includes(d));
    
    differences.push(...uniqueDirs1.map(d => `Only in project 1: ${d}`));
    differences.push(...uniqueDirs2.map(d => `Only in project 2: ${d}`));
    
    return differences;
  }

  private static generateComparisonRecommendations(analysis1: AnalysisResult, analysis2: AnalysisResult): string[] {
    const recommendations: string[] = [];
    
    if (analysis1.insights.testCoverage < analysis2.insights.testCoverage) {
      recommendations.push('Project 1 should improve test coverage');
    }
    
    if (analysis1.insights.codeQuality.score < analysis2.insights.codeQuality.score) {
      recommendations.push('Project 1 should improve code quality');
    }
    
    return recommendations;
  }

  private static generateMigrationPlan(structure1: ProjectStructure, structure2: ProjectStructure): any[] {
    const plan: any[] = [];
    
    // Simple migration plan - add missing directories
    const dirs1 = structure1.directories.map(d => d.name);
    const dirs2 = structure2.directories.map(d => d.name);
    const missingDirs = dirs2.filter(d => !dirs1.includes(d));
    
    plan.push(...missingDirs.map(d => ({
      action: 'add',
      to: d,
      reason: `Add missing directory: ${d}`
    })));
    
    return plan;
  }

  private static async analyzeLanguages(files: string[]): Promise<Array<{
    name: string;
    files: number;
    lines: number;
    bytes: number;
  }>> {
    const languages: Record<string, { files: number; lines: number; bytes: number }> = {};
    
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const language = this.getLanguageFromExtension(ext);
      
      if (language) {
        if (!languages[language]) {
          languages[language] = { files: 0, lines: 0, bytes: 0 };
        }
        
        languages[language].files++;
        
        try {
          const stats = await fs.stat(file);
          languages[language].bytes += stats.size;
          
          if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.py')) {
            const content = await fs.readFile(file, 'utf-8');
            languages[language].lines += content.split('\n').length;
          }
        } catch (error) {
          // Ignore files that can't be read
        }
      }
    }
    
    return Object.entries(languages).map(([name, stats]) => ({
      name,
      ...stats
    }));
  }

  private static async detectFrameworks(projectPath: string): Promise<string[]> {
    const frameworks: string[] = [];
    
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies
        };
        
        // Check for common frameworks
        if (allDeps.react) frameworks.push('react');
        if (allDeps.vue) frameworks.push('vue');
        if (allDeps.angular) frameworks.push('angular');
        if (allDeps.express) frameworks.push('express');
        if (allDeps.next) frameworks.push('next');
        if (allDeps.nuxt) frameworks.push('nuxt');
        if (allDeps.svelte) frameworks.push('svelte');
      }
    } catch (error) {
      // Ignore errors
    }
    
    return frameworks;
  }

  private static async extractDependencies(projectPath: string): Promise<string[]> {
    const dependencies: string[] = [];
    
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies
        };
        
        dependencies.push(...Object.keys(allDeps));
      }
    } catch (error) {
      // Ignore errors
    }
    
    return dependencies;
  }
}

export default ProjectAnalyzer;