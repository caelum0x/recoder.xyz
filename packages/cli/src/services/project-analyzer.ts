/**
 * Project Analysis and Context Understanding System
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { Logger } from '@recoder/shared';

import { ArchitectureInfo, CodebaseContext, CodePattern, CodeQualityMetrics, CodingConventions, Dependency, DirectoryInfo, DocumentationInfo, EnvironmentContext, ExistingCodeInfo, FileInfo, FileStructure, FrameworkInfo, LanguageInfo, ProjectContext, StructurePattern } from '@recoder/shared/types/code-generation';

// Helper function to recursively find files matching patterns
async function findFiles(dir: string, patterns: string[], ignorePatterns: string[] = []): Promise<string[]> {
  const results: string[] = [];
  
  async function walk(currentDir: string, relativePath: string = '') {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.join(relativePath, entry.name);
        
        // Check if should ignore
        if (ignorePatterns.some(pattern => relPath.includes(pattern.replace('/**', '')))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await walk(fullPath, relPath);
        } else {
          // Check if file matches any pattern
          if (patterns.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\./g, '\\.'));
            return regex.test(relPath);
          })) {
            results.push(relPath);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  await walk(dir);
  return results;
}

// Helper function to recursively find directories
async function findDirectories(dir: string, ignorePatterns: string[] = []): Promise<string[]> {
  const results: string[] = [];
  
  async function walk(currentDir: string, relativePath: string = '') {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.join(relativePath, entry.name);
        
        // Check if should ignore
        if (ignorePatterns.some(pattern => relPath.includes(pattern.replace('/**', '')))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          results.push(relPath);
          await walk(fullPath, relPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  await walk(dir);
  return results;
}

export class ProjectAnalyzer {
  private analysisCache: Map<string, any> = new Map();

  constructor() {
  }

  public async analyzeProject(rootPath: string): Promise<{
    project: ProjectContext;
    codebase: CodebaseContext;
    environment: EnvironmentContext;
  }> {
    const cacheKey = `project_${rootPath}`;
    
    if (this.analysisCache.has(cacheKey)) {
      Logger.debug('Using cached project analysis', { rootPath });
      return this.analysisCache.get(cacheKey);
    }

    Logger.info('Starting comprehensive project analysis', { rootPath });

    const startTime = Date.now();

    try {
      const [projectContext, codebaseContext, environmentContext] = await Promise.all([
        this.analyzeProjectContext(rootPath),
        this.analyzeCodebaseContext(rootPath),
        this.analyzeEnvironmentContext(rootPath)
      ]);

      const analysis = {
        project: projectContext,
        codebase: codebaseContext,
        environment: environmentContext
      };

      this.analysisCache.set(cacheKey, analysis);

      const duration = Date.now() - startTime;
      Logger.info('Project analysis completed', {
        rootPath,
        duration,
        totalFiles: codebaseContext.existingCode.totalFiles,
        languages: codebaseContext.existingCode.languages.length
      });

      return analysis;
    } catch (error) {
      Logger.error('Project analysis failed', { rootPath, error });
      throw error;
    }
  }

  private async analyzeProjectContext(rootPath: string): Promise<ProjectContext> {
    Logger.debug('Analyzing project context', { rootPath });

    const packageJsonPath = path.join(rootPath, 'package.json');
    let packageJson: any = {};
    let packageManager = 'npm';

    if (await fs.pathExists(packageJsonPath)) {
      packageJson = await fs.readJson(packageJsonPath);
    }

    // Detect package manager
    if (await fs.pathExists(path.join(rootPath, 'yarn.lock'))) {
      packageManager = 'yarn';
    } else if (await fs.pathExists(path.join(rootPath, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm';
    } else if (await fs.pathExists(path.join(rootPath, 'bun.lockb'))) {
      packageManager = 'bun';
    }

    // Detect build system
    const buildSystem = await this.detectBuildSystem(rootPath);

    // Extract dependencies
    const dependencies = this.extractDependencies(packageJson);
    const devDependencies = this.extractDependencies(packageJson, true);

    // Detect languages and frameworks
    const languages = await this.detectLanguages(rootPath);
    const frameworks = await this.detectFrameworks(rootPath, packageJson);

    // Analyze architecture
    const architecture = await this.analyzeArchitecture(rootPath);

    return {
      name: packageJson.name || path.basename(rootPath),
      type: this.detectProjectType(packageJson, rootPath),
      version: packageJson.version || '1.0.0',
      rootPath,
      packageManager: packageManager as any,
      buildSystem,
      languages,
      frameworks,
      dependencies,
      devDependencies,
      architecture
    };
  }

  private async analyzeCodebaseContext(rootPath: string): Promise<CodebaseContext> {
    Logger.debug('Analyzing codebase context', { rootPath });

    const [fileStructure, existingCode, patterns, conventions, documentation] = await Promise.all([
      this.analyzeFileStructure(rootPath),
      this.analyzeExistingCode(rootPath),
      this.detectCodePatterns(rootPath),
      this.analyzeCodingConventions(rootPath),
      this.analyzeDocumentation(rootPath)
    ]);

    return {
      fileStructure,
      existingCode,
      patterns,
      conventions,
      documentation
    };
  }

  private async analyzeEnvironmentContext(rootPath: string): Promise<EnvironmentContext> {
    Logger.debug('Analyzing environment context', { rootPath });

    // Read .nvmrc for Node version
    let nodeVersion: string | undefined;
    const nvmrcPath = path.join(rootPath, '.nvmrc');
    if (await fs.pathExists(nvmrcPath)) {
      nodeVersion = (await fs.readFile(nvmrcPath, 'utf8')).trim();
    }

    // Detect runtime environment
    const runtimeEnvironment = await this.detectRuntimeEnvironment(rootPath);

    // Detect target platforms
    const targetPlatforms = await this.detectTargetPlatforms(rootPath);

    // Detect deployment target
    const deploymentTarget = await this.detectDeploymentTarget(rootPath);

    // Read environment variables from .env files
    const environmentVariables = await this.readEnvironmentVariables(rootPath);

    return {
      nodeVersion,
      runtimeEnvironment,
      targetPlatforms,
      deploymentTarget,
      environmentVariables
    };
  }

  private async detectBuildSystem(rootPath: string): Promise<string> {
    const buildConfigs = [
      { file: 'webpack.config.js', system: 'webpack' },
      { file: 'vite.config.js', system: 'vite' },
      { file: 'vite.config.ts', system: 'vite' },
      { file: 'rollup.config.js', system: 'rollup' },
      { file: 'esbuild.config.js', system: 'esbuild' },
      { file: 'turbo.json', system: 'turbo' },
      { file: 'next.config.js', system: 'next.js' },
      { file: 'nuxt.config.js', system: 'nuxt.js' },
      { file: 'angular.json', system: 'angular-cli' },
      { file: 'vue.config.js', system: 'vue-cli' }
    ];

    for (const config of buildConfigs) {
      if (await fs.pathExists(path.join(rootPath, config.file))) {
        return config.system;
      }
    }

    return 'npm';
  }

  private extractDependencies(packageJson: any, dev = false): Dependency[] {
    const deps = dev ? packageJson.devDependencies : packageJson.dependencies;
    if (!deps) return [];

    return Object.entries(deps).map(([name, version]) => ({
      name,
      version: version as string,
      type: dev ? 'development' : 'production',
      purpose: this.categorizePackagePurpose(name)
    }));
  }

  private categorizePackagePurpose(packageName: string): string {
    const categories = {
      'react': 'UI Framework',
      'vue': 'UI Framework',
      'angular': 'UI Framework',
      'express': 'Web Server',
      'fastify': 'Web Server',
      'next': 'Full-stack Framework',
      'nuxt': 'Full-stack Framework',
      'typescript': 'Language',
      'babel': 'Transpiler',
      'webpack': 'Bundler',
      'vite': 'Build Tool',
      'jest': 'Testing',
      'vitest': 'Testing',
      'cypress': 'E2E Testing',
      'playwright': 'E2E Testing',
      'eslint': 'Linting',
      'prettier': 'Formatting',
      'tailwind': 'CSS Framework',
      'styled-components': 'CSS-in-JS',
      'prisma': 'ORM',
      'sequelize': 'ORM',
      'mongoose': 'ODM',
      'axios': 'HTTP Client',
      'lodash': 'Utility',
      'moment': 'Date Utility',
      'dayjs': 'Date Utility'
    };

    for (const [key, purpose] of Object.entries(categories)) {
      if (packageName.includes(key)) {
        return purpose;
      }
    }

    return 'Library';
  }

  private async detectLanguages(rootPath: string): Promise<string[]> {
    const languages = new Set<string>();
    const extensions = {
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.cs': 'C#',
      '.go': 'Go',
      '.rs': 'Rust',
      '.php': 'PHP',
      '.rb': 'Ruby',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.scala': 'Scala',
      '.cpp': 'C++',
      '.c': 'C',
      '.dart': 'Dart'
    };

    try {
      const files = await findFiles(rootPath, [
        '**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.py', '**/*.java', 
        '**/*.cs', '**/*.go', '**/*.rs', '**/*.php', '**/*.rb', '**/*.swift', 
        '**/*.kt', '**/*.scala', '**/*.cpp', '**/*.c', '**/*.dart'
      ], ['node_modules', 'dist', 'build', '.git']);

      files.forEach((file: string) => {
        const ext = path.extname(file);
        if (extensions[ext as keyof typeof extensions]) {
          languages.add(extensions[ext as keyof typeof extensions]);
        }
      });
    } catch (error) {
      Logger.warn('Failed to detect languages', { error });
    }

    return Array.from(languages);
  }

  private async detectFrameworks(rootPath: string, packageJson: any): Promise<string[]> {
    const frameworks = new Set<string>();
    
    // Check dependencies
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    const frameworkIndicators = {
      'react': 'React',
      'vue': 'Vue.js',
      '@angular/core': 'Angular',
      'svelte': 'Svelte',
      'next': 'Next.js',
      'nuxt': 'Nuxt.js',
      'gatsby': 'Gatsby',
      'express': 'Express.js',
      'fastify': 'Fastify',
      'koa': 'Koa.js',
      'nestjs': 'NestJS',
      'django': 'Django',
      'flask': 'Flask',
      'spring': 'Spring',
      'rails': 'Ruby on Rails',
      'laravel': 'Laravel',
      'symfony': 'Symfony',
      'asp.net': 'ASP.NET',
      'gin': 'Gin',
      'fiber': 'Fiber',
      'actix': 'Actix',
      'rocket': 'Rocket'
    };

    Object.keys(allDeps || {}).forEach(dep => {
      Object.entries(frameworkIndicators).forEach(([indicator, framework]) => {
        if (dep.includes(indicator)) {
          frameworks.add(framework);
        }
      });
    });

    // Check for config files
    const configFiles = {
      'angular.json': 'Angular',
      'vue.config.js': 'Vue.js',
      'next.config.js': 'Next.js',
      'nuxt.config.js': 'Nuxt.js',
      'gatsby-config.js': 'Gatsby',
      'svelte.config.js': 'Svelte'
    };

    for (const [file, framework] of Object.entries(configFiles)) {
      if (await fs.pathExists(path.join(rootPath, file))) {
        frameworks.add(framework);
      }
    }

    return Array.from(frameworks);
  }

  private async analyzeArchitecture(rootPath: string): Promise<ArchitectureInfo> {
    const directories = await this.getDirectoryStructure(rootPath);
    
    // Detect architecture pattern
    let pattern = 'unknown';
    let layers: string[] = [];
    let dataFlow = 'unknown';
    let scalability = 'unknown';

    // Check for common patterns
    if (directories.includes('src/components') && directories.includes('src/pages')) {
      pattern = 'component-based';
      layers = ['components', 'pages', 'hooks', 'utils'];
      dataFlow = 'unidirectional';
      scalability = 'horizontal';
    } else if (directories.includes('src/controllers') && directories.includes('src/models')) {
      pattern = 'mvc';
      layers = ['models', 'views', 'controllers'];
      dataFlow = 'request-response';
      scalability = 'vertical';
    } else if (directories.includes('src/domain') && directories.includes('src/infrastructure')) {
      pattern = 'clean-architecture';
      layers = ['domain', 'application', 'infrastructure', 'presentation'];
      dataFlow = 'dependency-inversion';
      scalability = 'horizontal';
    } else if (directories.includes('packages') || directories.includes('apps')) {
      pattern = 'monorepo';
      layers = ['shared', 'apps', 'packages'];
      dataFlow = 'modular';
      scalability = 'horizontal';
    } else if (directories.includes('microservices') || directories.includes('services')) {
      pattern = 'microservices';
      layers = ['api-gateway', 'services', 'data'];
      dataFlow = 'event-driven';
      scalability = 'horizontal';
    }

    return {
      pattern,
      layers,
      dataFlow,
      scalability
    };
  }

  private async getDirectoryStructure(rootPath: string): Promise<string[]> {
    try {
      const dirs = await findDirectories(rootPath, ['node_modules', '.git', 'dist', 'build']);
      return dirs.map((dir: string) => dir.replace(/\/$/, ''));
    } catch (error) {
      Logger.warn('Failed to get directory structure', { error });
      return [];
    }
  }

  private async analyzeFileStructure(rootPath: string): Promise<FileStructure> {
    const directories: DirectoryInfo[] = [];
    const files: FileInfo[] = [];
    const patterns: StructurePattern[] = [];

    try {
      // Analyze directories
      const dirPaths = await findDirectories(rootPath, ['node_modules', '.git', 'dist', 'build']);

      for (const dirPath of dirPaths) {
        const fullPath = path.join(rootPath, dirPath);
        const fileCount = (await fs.readdir(fullPath)).length;
        
        directories.push({
          path: dirPath,
          purpose: this.categorizeDirectoryPurpose(dirPath),
          fileCount,
          conventions: await this.detectDirectoryConventions(fullPath)
        });
      }

      // Analyze files
      const filePaths = await findFiles(rootPath, ['**/*'], ['node_modules', '.git', 'dist', 'build']);

      for (const filePath of filePaths.slice(0, 100)) { // Limit for performance
        const fullPath = path.join(rootPath, filePath);
        const stats = await fs.stat(fullPath);
        const ext = path.extname(filePath);
        
        files.push({
          path: filePath,
          type: this.categorizeFileType(filePath),
          size: stats.size,
          language: this.getLanguageFromExtension(ext),
          purpose: this.categorizeFilePurpose(filePath),
          dependencies: [],
          exports: []
        });
      }

      // Detect structure patterns
      patterns.push(...this.detectStructurePatterns(directories));

    } catch (error) {
      Logger.warn('Failed to analyze file structure', { error });
    }

    return {
      directories,
      files,
      patterns
    };
  }

  private categorizeDirectoryPurpose(dirPath: string): string {
    const purposes = {
      'src': 'Source Code',
      'components': 'UI Components',
      'pages': 'Application Pages',
      'utils': 'Utilities',
      'hooks': 'React Hooks',
      'services': 'Business Services',
      'api': 'API Layer',
      'models': 'Data Models',
      'controllers': 'Route Controllers',
      'middleware': 'Express Middleware',
      'config': 'Configuration',
      'test': 'Tests',
      'tests': 'Tests',
      '__tests__': 'Tests',
      'spec': 'Tests',
      'docs': 'Documentation',
      'assets': 'Static Assets',
      'public': 'Public Assets',
      'build': 'Build Output',
      'dist': 'Distribution',
      'lib': 'Library Code',
      'types': 'Type Definitions'
    };

    const dirName = path.basename(dirPath);
    return purposes[dirName as keyof typeof purposes] || 'General';
  }

  private async detectDirectoryConventions(dirPath: string): Promise<string[]> {
    const conventions: string[] = [];
    
    try {
      const files = await fs.readdir(dirPath);
      
      // Check naming conventions
      const hasIndexFile = files.some(f => f.startsWith('index.'));
      const hasReadme = files.some(f => f.toLowerCase().includes('readme'));
      const allKebabCase = files.every(f => /^[a-z0-9-]+(\.[a-z0-9]+)*$/.test(f));
      const allCamelCase = files.every(f => /^[a-zA-Z0-9]+(\.[a-z0-9]+)*$/.test(f));
      
      if (hasIndexFile) conventions.push('index-exports');
      if (hasReadme) conventions.push('documented');
      if (allKebabCase) conventions.push('kebab-case');
      if (allCamelCase) conventions.push('camelCase');
    } catch (error) {
      // Ignore errors
    }

    return conventions;
  }

  private categorizeFileType(filePath: string): string {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath);
    
    if (fileName.includes('.test.') || fileName.includes('.spec.')) return 'test';
    if (fileName.includes('.config.') || fileName.includes('.conf.')) return 'config';
    if (fileName.includes('.d.ts')) return 'types';
    if (['.md', '.txt', '.rst'].includes(ext)) return 'documentation';
    if (['.json', '.yaml', '.yml', '.toml', '.ini'].includes(ext)) return 'config';
    if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs'].includes(ext)) return 'source';
    
    return 'other';
  }

  private getLanguageFromExtension(ext: string): string {
    const languages = {
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.cs': 'C#',
      '.go': 'Go',
      '.rs': 'Rust',
      '.php': 'PHP',
      '.rb': 'Ruby'
    };
    
    return languages[ext as keyof typeof languages] || 'Unknown';
  }

  private categorizeFilePurpose(filePath: string): string {
    const fileName = path.basename(filePath).toLowerCase();
    
    if (fileName.includes('component')) return 'UI Component';
    if (fileName.includes('service')) return 'Service';
    if (fileName.includes('util')) return 'Utility';
    if (fileName.includes('hook')) return 'React Hook';
    if (fileName.includes('api')) return 'API';
    if (fileName.includes('model')) return 'Data Model';
    if (fileName.includes('controller')) return 'Controller';
    if (fileName.includes('middleware')) return 'Middleware';
    if (fileName.includes('config')) return 'Configuration';
    if (fileName.includes('test')) return 'Test';
    
    return 'General';
  }

  private detectStructurePatterns(directories: DirectoryInfo[]): StructurePattern[] {
    const patterns: StructurePattern[] = [];
    const dirNames = directories.map(d => path.basename(d.path));
    
    // Feature-based structure
    if (dirNames.includes('features') || dirNames.includes('modules')) {
      patterns.push({
        name: 'Feature-Based',
        description: 'Code organized by features/modules',
        examples: ['features/', 'modules/']
      });
    }
    
    // Layer-based structure
    if (dirNames.includes('components') && dirNames.includes('services')) {
      patterns.push({
        name: 'Layer-Based',
        description: 'Code organized by technical layers',
        examples: ['components/', 'services/', 'utils/']
      });
    }
    
    // Domain-driven structure
    if (dirNames.includes('domain') || dirNames.includes('entities')) {
      patterns.push({
        name: 'Domain-Driven',
        description: 'Code organized by business domains',
        examples: ['domain/', 'entities/', 'repositories/']
      });
    }
    
    return patterns;
  }

  private async analyzeExistingCode(rootPath: string): Promise<ExistingCodeInfo> {
    let totalFiles = 0;
    let totalLines = 0;
    const languageStats = new Map<string, { files: number; lines: number }>();
    const frameworkUsage = new Map<string, number>();

    try {
      const files = await findFiles(rootPath, [
        '**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.py', '**/*.java',
        '**/*.cs', '**/*.go', '**/*.rs', '**/*.php', '**/*.rb'
      ], ['node_modules', '.git', 'dist', 'build']);

      totalFiles = files.length;

      // Analyze each file
      for (const file of files.slice(0, 50)) { // Limit for performance
        try {
          const fullPath = path.join(rootPath, file);
          const content = await fs.readFile(fullPath, 'utf8');
          const lines = content.split('\n').length;
          const ext = path.extname(file);
          const language = this.getLanguageFromExtension(ext);
          
          totalLines += lines;
          
          // Update language stats
          const langStat = languageStats.get(language) || { files: 0, lines: 0 };
          langStat.files++;
          langStat.lines += lines;
          languageStats.set(language, langStat);
          
          // Detect framework usage
          this.detectFrameworkUsageInFile(content, frameworkUsage);
        } catch (error) {
          // Skip files that can't be read
        }
      }
    } catch (error) {
      Logger.warn('Failed to analyze existing code', { error });
    }

    // Convert maps to arrays
    const languages: LanguageInfo[] = Array.from(languageStats.entries()).map(([name, stats]) => ({
      name,
      version: 'unknown',
      fileCount: stats.files,
      lineCount: stats.lines,
      percentage: (stats.lines / totalLines) * 100
    }));

    const frameworks: FrameworkInfo[] = Array.from(frameworkUsage.entries()).map(([name, usage]) => ({
      name,
      version: 'unknown',
      usage: usage > 10 ? 'heavy' : usage > 5 ? 'moderate' : 'light',
      configuration: []
    }));

    return {
      totalFiles,
      totalLines,
      languages,
      frameworks,
      patterns: [], // Would be filled by pattern detection
      quality: await this.calculateCodeQuality(rootPath)
    };
  }

  private detectFrameworkUsageInFile(content: string, frameworkUsage: Map<string, number>): void {
    const frameworks = {
      'react': ['React', 'useState', 'useEffect', 'Component'],
      'vue': ['Vue', 'ref', 'reactive', 'computed'],
      'angular': ['@Component', '@Injectable', '@NgModule'],
      'express': ['express', 'app.get', 'app.post', 'req.', 'res.'],
      'next': ['Next', 'getServerSideProps', 'getStaticProps'],
      'nestjs': ['@Controller', '@Service', '@Module', 'Injectable']
    };

    Object.entries(frameworks).forEach(([framework, indicators]) => {
      let count = 0;
      indicators.forEach(indicator => {
        const regex = new RegExp(indicator, 'g');
        const matches = content.match(regex);
        if (matches) count += matches.length;
      });
      
      if (count > 0) {
        frameworkUsage.set(framework, (frameworkUsage.get(framework) || 0) + count);
      }
    });
  }

  private async calculateCodeQuality(rootPath: string): Promise<CodeQualityMetrics> {
    // Simplified quality calculation
    return {
      complexity: 5.2, // Would calculate cyclomatic complexity
      maintainability: 75, // Would use maintainability index
      testCoverage: 0, // Would calculate from test files
      duplication: 8, // Would detect code duplication
      debt: 120 // Technical debt in minutes
    };
  }

  private async detectCodePatterns(rootPath: string): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];
    
    // This would be more sophisticated in practice
    patterns.push({
      name: 'Module Exports',
      type: 'structure',
      description: 'CommonJS or ES6 module exports',
      examples: ['module.exports', 'export default', 'export const'],
      frequency: 85
    });

    return patterns;
  }

  private async analyzeCodingConventions(rootPath: string): Promise<CodingConventions> {
    // This would analyze actual code files for conventions
    // For now, return sensible defaults
    return {
      indentation: 'spaces',
      indentSize: 2,
      lineLength: 100,
      namingConvention: 'camelCase',
      quotingStyle: 'single',
      semicolons: true,
      trailingCommas: true,
      bracketStyle: 'same-line'
    };
  }

  private async analyzeDocumentation(rootPath: string): Promise<DocumentationInfo> {
    let exists = false;
    let coverage = 0;
    const formats: string[] = [];
    let upToDate = false;
    let quality: 'poor' | 'fair' | 'good' | 'excellent' = 'poor';

    try {
      // Check for documentation files
      const docFiles = await findFiles(rootPath, [
        '**/*.md', '**/*.txt', '**/*.rst', '**/*.doc', '**/*.docx'
      ], ['node_modules', '.git']);

      exists = docFiles.length > 0;
      
      if (exists) {
        formats.push('markdown', 'text');
        coverage = Math.min((docFiles.length / 10) * 100, 100); // Simplified
        upToDate = true; // Would check last modified dates
        quality = coverage > 80 ? 'excellent' : coverage > 60 ? 'good' : coverage > 30 ? 'fair' : 'poor';
      }
    } catch (error) {
      Logger.warn('Failed to analyze documentation', { error });
    }

    return {
      exists,
      coverage,
      format: formats,
      upToDate,
      quality
    };
  }

  private detectProjectType(packageJson: any, rootPath: string): string {
    // Check package.json scripts and dependencies
    const scripts = packageJson.scripts || {};
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (dependencies['react'] || dependencies['@types/react']) {
      return 'react-app';
    }
    if (dependencies['vue'] || dependencies['@vue/cli-service']) {
      return 'vue-app';
    }
    if (dependencies['@angular/core']) {
      return 'angular-app';
    }
    if (dependencies['next']) {
      return 'next-app';
    }
    if (dependencies['nuxt']) {
      return 'nuxt-app';
    }
    if (dependencies['express'] || dependencies['fastify']) {
      return 'node-server';
    }
    if (scripts.build && scripts.start) {
      return 'web-app';
    }
    if (packageJson.type === 'module' || dependencies['typescript']) {
      return 'library';
    }

    return 'unknown';
  }

  private async detectRuntimeEnvironment(rootPath: string): Promise<'browser' | 'node' | 'deno' | 'bun' | 'react-native'> {
    // Check for environment indicators
    if (await fs.pathExists(path.join(rootPath, 'deno.json'))) {
      return 'deno';
    }
    if (await fs.pathExists(path.join(rootPath, 'bun.lockb'))) {
      return 'bun';
    }
    if (await fs.pathExists(path.join(rootPath, 'metro.config.js'))) {
      return 'react-native';
    }
    
    // Check package.json for browser field or webpack config
    const packageJsonPath = path.join(rootPath, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      if (packageJson.browser || packageJson.dependencies?.webpack) {
        return 'browser';
      }
    }

    return 'node';
  }

  private async detectTargetPlatforms(rootPath: string): Promise<string[]> {
    const platforms: string[] = [];
    
    const packageJsonPath = path.join(rootPath, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (deps['react-native']) platforms.push('mobile');
      if (deps['electron']) platforms.push('desktop');
      if (deps['react'] || deps['vue'] || deps['angular']) platforms.push('web');
      if (deps['express'] || deps['fastify']) platforms.push('server');
    }

    return platforms.length > 0 ? platforms : ['web'];
  }

  private async detectDeploymentTarget(rootPath: string): Promise<string> {
    const deploymentFiles = {
      'Dockerfile': 'docker',
      'docker-compose.yml': 'docker-compose',
      'vercel.json': 'vercel',
      'netlify.toml': 'netlify',
      '.github/workflows': 'github-actions',
      'serverless.yml': 'serverless',
      'terraform': 'terraform',
      'k8s': 'kubernetes'
    };

    for (const [file, target] of Object.entries(deploymentFiles)) {
      if (await fs.pathExists(path.join(rootPath, file))) {
        return target;
      }
    }

    return 'unknown';
  }

  private async readEnvironmentVariables(rootPath: string): Promise<Record<string, string>> {
    const envVars: Record<string, string> = {};
    const envFiles = ['.env', '.env.local', '.env.example'];

    for (const envFile of envFiles) {
      try {
        const envPath = path.join(rootPath, envFile);
        if (await fs.pathExists(envPath)) {
          const content = await fs.readFile(envPath, 'utf8');
          const lines = content.split('\n');
          
          for (const line of lines) {
            const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
            if (match) {
              envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
            }
          }
        }
      } catch (error) {
        // Ignore errors reading env files
      }
    }

    return envVars;
  }

  public clearCache(): void {
    this.analysisCache.clear();
    Logger.debug('Project analysis cache cleared');
  }

  public getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.analysisCache.size,
      keys: Array.from(this.analysisCache.keys())
    };
  }
}