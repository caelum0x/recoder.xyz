/**
 * Project Analysis Service
 * 
 * Comprehensive codebase analysis system that examines project structure,
 * languages, frameworks, dependencies, and patterns to provide context
 * for intelligent model recommendations and AI assistance optimization.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Logger } from '@recoder/shared';

export interface FileAnalysis {
  path: string;
  extension: string;
  language: string;
  lineCount: number;
  size: number;
  complexity: 'low' | 'medium' | 'high';
  features: string[];              // Detected patterns/features
  imports: string[];              // Dependencies/imports found
  frameworks: string[];           // Framework usage
  aiRelevance: number;            // 0-1 score for AI assistance potential
}

export interface LanguageStats {
  name: string;
  files: number;
  lines: number;
  bytes: number;
  percentage: number;
  complexity: 'low' | 'medium' | 'high';
  mainFrameworks: string[];
  commonPatterns: string[];
}

export interface FrameworkDetection {
  name: string;
  confidence: number;             // 0-1 confidence score
  version?: string;
  files: string[];               // Files that indicate this framework
  evidence: string[];            // Evidence for detection
  ecosystem: string[];           // Related tools/libraries
}

export interface ProjectComplexity {
  overall: 'simple' | 'medium' | 'complex';
  factors: {
    codeSize: 'small' | 'medium' | 'large';
    languageCount: 'single' | 'few' | 'many';
    dependencies: 'minimal' | 'moderate' | 'extensive';
    architecture: 'simple' | 'layered' | 'microservices';
    patterns: string[];
  };
  score: number;                  // 0-100 complexity score
}

export interface AIUsagePattern {
  promptTypes: Array<{
    type: 'code-generation' | 'debugging' | 'refactoring' | 'documentation' | 'testing';
    frequency: number;
    avgLength: number;
    languages: string[];
  }>;
  preferredModels: string[];
  responsePreferences: {
    length: 'short' | 'medium' | 'detailed';
    style: 'concise' | 'explanatory' | 'tutorial';
    includeTests: boolean;
    includeComments: boolean;
  };
  usageFrequency: 'low' | 'medium' | 'high';
  peakHours: number[];            // Hours of day (0-23)
}

export interface ProjectAnalysis {
  projectPath: string;
  name: string;
  type: 'web' | 'mobile' | 'desktop' | 'cli' | 'library' | 'api' | 'data' | 'game' | 'unknown';
  languages: LanguageStats[];
  frameworks: FrameworkDetection[];
  complexity: ProjectComplexity;
  dependencies: Array<{
    name: string;
    version?: string;
    type: 'runtime' | 'dev' | 'peer';
    ecosystem: string;
  }>;
  fileStructure: {
    totalFiles: number;
    totalLines: number;
    totalSize: number;
    directories: number;
    fileTypes: Record<string, number>;
  };
  aiUsagePatterns?: AIUsagePattern;
  recommendations: {
    aiModels: string[];
    optimizations: string[];
    patterns: string[];
  };
  lastAnalyzed: Date;
}

export class ProjectAnalyzer extends EventEmitter {
  private analysisCache: Map<string, ProjectAnalysis> = new Map();
  private readonly CACHE_DURATION = 1000 * 60 * 30; // 30 minutes
  
  // Language detection patterns
  private readonly LANGUAGE_PATTERNS = {
    javascript: {
      extensions: ['.js', '.mjs', '.cjs'],
      keywords: ['function', 'const', 'let', 'var', 'async', 'await'],
      imports: ['require', 'import', 'export'],
      frameworks: ['react', 'vue', 'angular', 'express', 'fastify']
    },
    typescript: {
      extensions: ['.ts', '.tsx'],
      keywords: ['interface', 'type', 'enum', 'declare', 'namespace'],
      imports: ['import', 'export'],
      frameworks: ['react', 'vue', 'angular', 'nest', 'express']
    },
    python: {
      extensions: ['.py', '.pyx', '.pyi'],
      keywords: ['def', 'class', 'import', 'from', 'async def'],
      imports: ['import', 'from'],
      frameworks: ['django', 'flask', 'fastapi', 'pytorch', 'tensorflow']
    },
    rust: {
      extensions: ['.rs'],
      keywords: ['fn', 'struct', 'enum', 'impl', 'trait', 'match'],
      imports: ['use', 'mod'],
      frameworks: ['actix', 'rocket', 'tokio', 'serde']
    },
    go: {
      extensions: ['.go'],
      keywords: ['func', 'struct', 'interface', 'package', 'import'],
      imports: ['import'],
      frameworks: ['gin', 'echo', 'fiber', 'gorilla']
    },
    java: {
      extensions: ['.java'],
      keywords: ['class', 'interface', 'enum', 'package', 'import'],
      imports: ['import'],
      frameworks: ['spring', 'quarkus', 'micronaut']
    },
    cpp: {
      extensions: ['.cpp', '.cc', '.cxx', '.c++', '.hpp', '.h'],
      keywords: ['class', 'struct', 'namespace', 'template', '#include'],
      imports: ['#include'],
      frameworks: ['qt', 'boost', 'opencv']
    },
    csharp: {
      extensions: ['.cs'],
      keywords: ['class', 'interface', 'namespace', 'using'],
      imports: ['using'],
      frameworks: ['dotnet', 'aspnet', 'unity']
    }
  };

  // Framework detection patterns
  private readonly FRAMEWORK_PATTERNS = {
    react: {
      files: ['package.json'],
      patterns: ['react', 'jsx', 'tsx', 'useState', 'useEffect'],
      dependencies: ['react', 'react-dom', 'react-scripts'],
      ecosystem: ['next', 'gatsby', 'create-react-app']
    },
    vue: {
      files: ['package.json', 'vue.config.js'],
      patterns: ['vue', '.vue', 'v-if', 'v-for'],
      dependencies: ['vue', '@vue/cli'],
      ecosystem: ['nuxt', 'vite', 'quasar']
    },
    angular: {
      files: ['angular.json', 'package.json'],
      patterns: ['@angular', '@Component', '@Injectable'],
      dependencies: ['@angular/core', '@angular/cli'],
      ecosystem: ['ionic', 'nx']
    },
    nextjs: {
      files: ['next.config.js', 'package.json'],
      patterns: ['next', 'getStaticProps', 'getServerSideProps'],
      dependencies: ['next'],
      ecosystem: ['vercel']
    },
    express: {
      files: ['package.json'],
      patterns: ['express', 'app.listen', 'app.get', 'req', 'res'],
      dependencies: ['express'],
      ecosystem: ['cors', 'helmet', 'morgan']
    },
    django: {
      files: ['manage.py', 'settings.py', 'requirements.txt'],
      patterns: ['django', 'models.py', 'views.py', 'urls.py'],
      dependencies: ['Django'],
      ecosystem: ['celery', 'gunicorn', 'redis']
    },
    flask: {
      files: ['app.py', 'requirements.txt'],
      patterns: ['flask', 'Flask', '@app.route'],
      dependencies: ['Flask'],
      ecosystem: ['sqlalchemy', 'jinja2']
    },
    spring: {
      files: ['pom.xml', 'build.gradle'],
      patterns: ['@SpringBootApplication', '@RestController', '@Service'],
      dependencies: ['spring-boot-starter'],
      ecosystem: ['hibernate', 'thymeleaf']
    }
  };

  constructor() {
    super();
  }

  /**
   * Analyze a project directory
   */
  async analyzeProject(projectPath: string, options: {
    includeAIPatterns?: boolean;
    maxFiles?: number;
    excludePatterns?: string[];
  } = {}): Promise<ProjectAnalysis> {
    const cacheKey = `${projectPath}:${JSON.stringify(options)}`;
    
    // Check cache first
    const cached = this.analysisCache.get(cacheKey);
    if (cached && (Date.now() - cached.lastAnalyzed.getTime()) < this.CACHE_DURATION) {
      return cached;
    }

    Logger.info(`Analyzing project: ${projectPath}`);

    try {
      const startTime = Date.now();

      // Basic project info
      const projectName = path.basename(projectPath);
      
      // Scan files
      const files = await this.scanFiles(projectPath, options);
      const fileAnalyses = await this.analyzeFiles(files.slice(0, options.maxFiles || 1000));
      
      // Language analysis
      const languages = this.analyzeLanguages(fileAnalyses);
      
      // Framework detection
      const frameworks = await this.detectFrameworks(projectPath, fileAnalyses);
      
      // Project type detection
      const projectType = this.detectProjectType(frameworks, languages, fileAnalyses);
      
      // Complexity analysis
      const complexity = this.analyzeComplexity(fileAnalyses, languages, frameworks);
      
      // Dependencies analysis
      const dependencies = await this.analyzeDependencies(projectPath);
      
      // File structure summary
      const fileStructure = this.summarizeFileStructure(fileAnalyses);
      
      // AI usage patterns (if requested)
      const aiUsagePatterns = options.includeAIPatterns 
        ? await this.analyzeAIUsagePatterns(projectPath)
        : undefined;
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(languages, frameworks, complexity, projectType);

      const analysis: ProjectAnalysis = {
        projectPath,
        name: projectName,
        type: projectType,
        languages,
        frameworks,
        complexity,
        dependencies,
        fileStructure,
        aiUsagePatterns,
        recommendations,
        lastAnalyzed: new Date()
      };

      // Cache the analysis
      this.analysisCache.set(cacheKey, analysis);

      const duration = Date.now() - startTime;
      Logger.info(`Project analysis completed in ${duration}ms`, {
        files: fileAnalyses.length,
        languages: languages.length,
        frameworks: frameworks.length
      });

      this.emit('analysisComplete', analysis);
      return analysis;

    } catch (error) {
      Logger.error(`Failed to analyze project ${projectPath}:`, error);
      throw error;
    }
  }

  /**
   * Get cached analysis if available
   */
  getCachedAnalysis(projectPath: string): ProjectAnalysis | null {
    for (const [key, analysis] of this.analysisCache.entries()) {
      if (key.startsWith(`${projectPath}:`)) {
        return analysis;
      }
    }
    return null;
  }

  /**
   * Clear analysis cache
   */
  clearCache(projectPath?: string): void {
    if (projectPath) {
      for (const key of this.analysisCache.keys()) {
        if (key.startsWith(`${projectPath}:`)) {
          this.analysisCache.delete(key);
        }
      }
    } else {
      this.analysisCache.clear();
    }
  }

  /**
   * Get analysis summary for multiple projects
   */
  async getPortfolioAnalysis(projectPaths: string[]): Promise<{
    totalProjects: number;
    languageDistribution: Record<string, number>;
    frameworkUsage: Record<string, number>;
    complexityDistribution: Record<string, number>;
    recommendations: string[];
  }> {
    const analyses = await Promise.all(
      projectPaths.map(path => this.analyzeProject(path))
    );

    const languageDistribution: Record<string, number> = {};
    const frameworkUsage: Record<string, number> = {};
    const complexityDistribution: Record<string, number> = {};
    const allRecommendations = new Set<string>();

    for (const analysis of analyses) {
      // Language distribution
      analysis.languages.forEach(lang => {
        languageDistribution[lang.name] = (languageDistribution[lang.name] || 0) + 1;
      });

      // Framework usage
      analysis.frameworks.forEach(fw => {
        frameworkUsage[fw.name] = (frameworkUsage[fw.name] || 0) + 1;
      });

      // Complexity distribution
      complexityDistribution[analysis.complexity.overall] = 
        (complexityDistribution[analysis.complexity.overall] || 0) + 1;

      // Collect recommendations
      analysis.recommendations.aiModels.forEach(model => allRecommendations.add(model));
    }

    return {
      totalProjects: analyses.length,
      languageDistribution,
      frameworkUsage,
      complexityDistribution,
      recommendations: Array.from(allRecommendations)
    };
  }

  // Private helper methods

  private async scanFiles(
    projectPath: string, 
    options: { excludePatterns?: string[] }
  ): Promise<string[]> {
    const files: string[] = [];
    const excludePatterns = options.excludePatterns || [
      'node_modules', '.git', 'dist', 'build', '__pycache__', 
      '.venv', 'target', 'bin', 'obj', '.idea', '.vscode'
    ];

    const scanDirectory = async (dirPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(projectPath, fullPath);

          // Skip excluded patterns
          if (excludePatterns.some(pattern => relativePath.includes(pattern))) {
            continue;
          }

          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    await scanDirectory(projectPath);
    return files;
  }

  private async analyzeFiles(filePaths: string[]): Promise<FileAnalysis[]> {
    const analyses: FileAnalysis[] = [];

    for (const filePath of filePaths) {
      try {
        const analysis = await this.analyzeFile(filePath);
        if (analysis) {
          analyses.push(analysis);
        }
      } catch (error) {
        // Skip files we can't analyze
      }
    }

    return analyses;
  }

  private async analyzeFile(filePath: string): Promise<FileAnalysis | null> {
    try {
      const stats = await fs.stat(filePath);
      const extension = path.extname(filePath).toLowerCase();
      
      // Skip binary files and very large files
      if (stats.size > 1024 * 1024 || this.isBinaryFile(extension)) {
        return null;
      }

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      const language = this.detectLanguage(filePath, content);

      if (!language) {
        return null;
      }

      const features = this.extractFeatures(content, language);
      const imports = this.extractImports(content, language);
      const frameworks = this.detectFileFrameworks(content, language);
      const complexity = this.calculateFileComplexity(content, language);
      const aiRelevance = this.calculateAIRelevance(content, extension, features);

      return {
        path: filePath,
        extension,
        language,
        lineCount: lines.length,
        size: stats.size,
        complexity,
        features,
        imports,
        frameworks,
        aiRelevance
      };
    } catch (error) {
      return null;
    }
  }

  private detectLanguage(filePath: string, content: string): string | null {
    const extension = path.extname(filePath).toLowerCase();
    
    // Check by extension first
    for (const [lang, config] of Object.entries(this.LANGUAGE_PATTERNS)) {
      if (config.extensions.includes(extension)) {
        return lang;
      }
    }

    // Check by content patterns
    for (const [lang, config] of Object.entries(this.LANGUAGE_PATTERNS)) {
      const keywordMatches = config.keywords.filter(kw => content.includes(kw)).length;
      if (keywordMatches >= 2) {
        return lang;
      }
    }

    return null;
  }

  private isBinaryFile(extension: string): boolean {
    const binaryExtensions = [
      '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico',
      '.mp3', '.mp4', '.avi', '.mov', '.pdf', '.zip',
      '.tar', '.gz', '.rar', '.7z'
    ];
    
    return binaryExtensions.includes(extension);
  }

  private extractFeatures(content: string, language: string): string[] {
    const features: string[] = [];
    const lowerContent = content.toLowerCase();

    // Language-specific patterns
    const patterns = {
      async: /async|await|promise/gi,
      testing: /test|spec|describe|it\(/gi,
      database: /sql|database|mongodb|postgres|mysql/gi,
      api: /api|rest|graphql|endpoint/gi,
      ui: /component|render|dom|html/gi,
      auth: /auth|login|jwt|token|session/gi,
      crypto: /crypto|hash|encrypt|decrypt/gi,
      ml: /machine.*learning|tensorflow|pytorch|model/gi
    };

    for (const [feature, pattern] of Object.entries(patterns)) {
      if (pattern.test(content)) {
        features.push(feature);
      }
    }

    return features;
  }

  private extractImports(content: string, language: string): string[] {
    const imports: string[] = [];
    const lines = content.split('\n');

    const importPatterns = {
      javascript: /import\s+.*from\s+['"]([^'"]+)['"]/g,
      typescript: /import\s+.*from\s+['"]([^'"]+)['"]/g,
      python: /(?:import\s+(\w+)|from\s+(\w+)\s+import)/g,
      rust: /use\s+([\w:]+)/g,
      go: /import\s+(?:\(([^)]+)\)|"([^"]+)")/g,
      java: /import\s+([\w.]+)/g
    };

    const pattern = importPatterns[language as keyof typeof importPatterns];
    if (pattern) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importName = match[1] || match[2];
        if (importName && !importName.startsWith('.')) {
          imports.push(importName.split('.')[0]);
        }
      }
    }

    return [...new Set(imports)];
  }

  private detectFileFrameworks(content: string, language: string): string[] {
    const frameworks: string[] = [];
    const lowerContent = content.toLowerCase();

    for (const [framework, config] of Object.entries(this.FRAMEWORK_PATTERNS)) {
      const matches = config.patterns.filter(pattern => 
        lowerContent.includes(pattern.toLowerCase())
      ).length;

      if (matches >= 1) {
        frameworks.push(framework);
      }
    }

    return frameworks;
  }

  private calculateFileComplexity(content: string, language: string): 'low' | 'medium' | 'high' {
    const lines = content.split('\n').length;
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(content);
    
    // Simple heuristic based on lines and cyclomatic complexity
    if (lines < 50 && cyclomaticComplexity < 5) return 'low';
    if (lines < 200 && cyclomaticComplexity < 10) return 'medium';
    return 'high';
  }

  private calculateCyclomaticComplexity(content: string): number {
    // Count decision points
    const complexityPatterns = /\b(if|else|for|while|switch|case|catch|&&|\|\||\?)\b/g;
    const matches = content.match(complexityPatterns);
    return (matches?.length || 0) + 1; // +1 for the main path
  }

  private calculateAIRelevance(content: string, extension: string, features: string[]): number {
    let score = 0.5; // Base score

    // Higher relevance for code files
    const codeExtensions = ['.js', '.ts', '.py', '.rs', '.go', '.java', '.cpp', '.cs'];
    if (codeExtensions.includes(extension)) {
      score += 0.3;
    }

    // Features that benefit from AI assistance
    const aiRelevantFeatures = ['testing', 'api', 'database', 'auth', 'crypto', 'ml'];
    const relevantFeatureCount = features.filter(f => aiRelevantFeatures.includes(f)).length;
    score += relevantFeatureCount * 0.1;

    // Complex code benefits more from AI
    if (content.length > 1000) score += 0.1;
    if (content.split('\n').length > 100) score += 0.1;

    return Math.min(1, score);
  }

  private analyzeLanguages(fileAnalyses: FileAnalysis[]): LanguageStats[] {
    const languageStats = new Map<string, {
      files: number;
      lines: number;
      bytes: number;
      complexities: string[];
      frameworks: Set<string>;
      patterns: Set<string>;
    }>();

    const totalLines = fileAnalyses.reduce((sum, file) => sum + file.lineCount, 0);

    for (const file of fileAnalyses) {
      const current = languageStats.get(file.language) || {
        files: 0,
        lines: 0,
        bytes: 0,
        complexities: [],
        frameworks: new Set(),
        patterns: new Set()
      };

      current.files++;
      current.lines += file.lineCount;
      current.bytes += file.size;
      current.complexities.push(file.complexity);
      file.frameworks.forEach(fw => current.frameworks.add(fw));
      file.features.forEach(feature => current.patterns.add(feature));

      languageStats.set(file.language, current);
    }

    return Array.from(languageStats.entries()).map(([name, stats]) => ({
      name,
      files: stats.files,
      lines: stats.lines,
      bytes: stats.bytes,
      percentage: (stats.lines / totalLines) * 100,
      complexity: this.determineOverallComplexity(stats.complexities),
      mainFrameworks: Array.from(stats.frameworks).slice(0, 3),
      commonPatterns: Array.from(stats.patterns).slice(0, 5)
    })).sort((a, b) => b.percentage - a.percentage);
  }

  private determineOverallComplexity(complexities: string[]): 'low' | 'medium' | 'high' {
    const high = complexities.filter(c => c === 'high').length;
    const medium = complexities.filter(c => c === 'medium').length;
    const total = complexities.length;

    if (high / total > 0.3) return 'high';
    if ((high + medium) / total > 0.5) return 'medium';
    return 'low';
  }

  private async detectFrameworks(projectPath: string, fileAnalyses: FileAnalysis[]): Promise<FrameworkDetection[]> {
    const frameworks: FrameworkDetection[] = [];

    for (const [frameworkName, config] of Object.entries(this.FRAMEWORK_PATTERNS)) {
      let confidence = 0;
      const evidence: string[] = [];
      const indicatorFiles: string[] = [];

      // Check for indicator files
      for (const fileName of config.files) {
        try {
          const filePath = path.join(projectPath, fileName);
          await fs.access(filePath);
          confidence += 0.4;
          evidence.push(`Found ${fileName}`);
          indicatorFiles.push(fileName);
        } catch (error) {
          // File doesn't exist
        }
      }

      // Check for patterns in code
      const patternMatches = fileAnalyses.reduce((count, file) => {
        return count + file.frameworks.filter(fw => fw === frameworkName).length;
      }, 0);

      if (patternMatches > 0) {
        confidence += Math.min(0.5, patternMatches * 0.1);
        evidence.push(`Found ${patternMatches} pattern matches`);
      }

      // Check dependencies
      try {
        const packageJson = await this.readPackageJson(projectPath);
        if (packageJson) {
          const allDeps = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
            ...packageJson.peerDependencies
          };

          for (const dep of config.dependencies) {
            if (allDeps[dep]) {
              confidence += 0.3;
              evidence.push(`Dependency: ${dep}`);
            }
          }
        }
      } catch (error) {
        // No package.json or can't read it
      }

      if (confidence > 0.2) {
        frameworks.push({
          name: frameworkName,
          confidence: Math.min(1, confidence),
          files: indicatorFiles,
          evidence,
          ecosystem: config.ecosystem
        });
      }
    }

    return frameworks.sort((a, b) => b.confidence - a.confidence);
  }

  private detectProjectType(
    frameworks: FrameworkDetection[],
    languages: LanguageStats[],
    fileAnalyses: FileAnalysis[]
  ): ProjectAnalysis['type'] {
    // Web frameworks
    const webFrameworks = ['react', 'vue', 'angular', 'nextjs', 'svelte'];
    if (frameworks.some(fw => webFrameworks.includes(fw.name))) {
      return 'web';
    }

    // Mobile frameworks
    const mobileFrameworks = ['react-native', 'flutter', 'ionic'];
    if (frameworks.some(fw => mobileFrameworks.includes(fw.name))) {
      return 'mobile';
    }

    // API/Backend frameworks
    const backendFrameworks = ['express', 'fastify', 'django', 'flask', 'spring'];
    if (frameworks.some(fw => backendFrameworks.includes(fw.name))) {
      return 'api';
    }

    // CLI applications
    const hasMainFunction = fileAnalyses.some(file => 
      file.features.includes('cli') || 
      (file as any).content?.includes('main(') ||
      (file as any).content?.includes('if __name__ == "__main__"')
    );
    
    if (hasMainFunction) {
      return 'cli';
    }

    // Default based on primary language
    const primaryLanguage = languages[0]?.name;
    if (primaryLanguage === 'python' && fileAnalyses.some(f => f.features.includes('ml'))) {
      return 'data';
    }

    return 'unknown';
  }

  private analyzeComplexity(
    fileAnalyses: FileAnalysis[],
    languages: LanguageStats[],
    frameworks: FrameworkDetection[]
  ): ProjectComplexity {
    const totalLines = fileAnalyses.reduce((sum, file) => sum + file.lineCount, 0);
    const totalFiles = fileAnalyses.length;

    // Calculate complexity factors
    const codeSize = totalLines < 1000 ? 'small' : totalLines < 10000 ? 'medium' : 'large';
    const languageCount = languages.length === 1 ? 'single' : languages.length <= 3 ? 'few' : 'many';
    
    const dependencyCount = frameworks.length;
    const dependencies = dependencyCount < 3 ? 'minimal' : dependencyCount < 8 ? 'moderate' : 'extensive';

    const patterns = [...new Set(fileAnalyses.flatMap(f => f.features))];
    const hasComplexPatterns = patterns.some(p => ['database', 'auth', 'crypto', 'ml'].includes(p));
    const architecture = hasComplexPatterns ? 'layered' : 'simple';

    // Calculate overall complexity score
    let score = 0;
    score += codeSize === 'large' ? 40 : codeSize === 'medium' ? 20 : 10;
    score += languageCount === 'many' ? 20 : languageCount === 'few' ? 10 : 5;
    score += dependencies === 'extensive' ? 25 : dependencies === 'moderate' ? 15 : 5;
    score += hasComplexPatterns ? 15 : 5;

    const overall = score < 40 ? 'simple' : score < 70 ? 'medium' : 'complex';

    return {
      overall,
      factors: {
        codeSize,
        languageCount,
        dependencies,
        architecture,
        patterns
      },
      score
    };
  }

  private async analyzeDependencies(projectPath: string): Promise<ProjectAnalysis['dependencies']> {
    const dependencies: ProjectAnalysis['dependencies'] = [];

    try {
      const packageJson = await this.readPackageJson(projectPath);
      if (packageJson) {
        // Runtime dependencies
        Object.entries(packageJson.dependencies || {}).forEach(([name, version]) => {
          dependencies.push({
            name,
            version: version as string,
            type: 'runtime',
            ecosystem: this.detectEcosystem(name)
          });
        });

        // Dev dependencies
        Object.entries(packageJson.devDependencies || {}).forEach(([name, version]) => {
          dependencies.push({
            name,
            version: version as string,
            type: 'dev',
            ecosystem: this.detectEcosystem(name)
          });
        });
      }
    } catch (error) {
      // No package.json or can't read it
    }

    // TODO: Add support for other dependency files (requirements.txt, Cargo.toml, etc.)

    return dependencies;
  }

  private detectEcosystem(packageName: string): string {
    if (packageName.startsWith('@types/')) return 'typescript';
    if (packageName.startsWith('react')) return 'react';
    if (packageName.startsWith('vue')) return 'vue';
    if (packageName.startsWith('@angular')) return 'angular';
    if (packageName.includes('test') || packageName.includes('jest')) return 'testing';
    if (packageName.includes('babel') || packageName.includes('webpack')) return 'build';
    return 'general';
  }

  private summarizeFileStructure(fileAnalyses: FileAnalysis[]): ProjectAnalysis['fileStructure'] {
    const fileTypes: Record<string, number> = {};
    let totalLines = 0;
    let totalSize = 0;

    for (const file of fileAnalyses) {
      fileTypes[file.extension] = (fileTypes[file.extension] || 0) + 1;
      totalLines += file.lineCount;
      totalSize += file.size;
    }

    return {
      totalFiles: fileAnalyses.length,
      totalLines,
      totalSize,
      directories: 0, // Would be calculated during scanning
      fileTypes
    };
  }

  private async analyzeAIUsagePatterns(projectPath: string): Promise<AIUsagePattern | undefined> {
    // This would analyze AI usage history from logs or configuration
    // For now, return undefined to indicate no patterns found
    return undefined;
  }

  private generateRecommendations(
    languages: LanguageStats[],
    frameworks: FrameworkDetection[],
    complexity: ProjectComplexity,
    projectType: ProjectAnalysis['type']
  ): ProjectAnalysis['recommendations'] {
    const aiModels: string[] = [];
    const optimizations: string[] = [];
    const patterns: string[] = [];

    // Model recommendations based on languages
    const primaryLanguage = languages[0]?.name;
    if (primaryLanguage === 'javascript' || primaryLanguage === 'typescript') {
      aiModels.push('codellama:7b', 'qwen2.5-coder:7b');
    } else if (primaryLanguage === 'python') {
      aiModels.push('deepseek-coder:6.7b', 'codellama:7b');
    } else if (primaryLanguage === 'rust' || primaryLanguage === 'go') {
      aiModels.push('qwen2.5-coder:7b', 'granite-code:3b');
    }

    // Complexity-based recommendations
    if (complexity.overall === 'complex') {
      aiModels.push('llama3.1:8b'); // Larger model for complex projects
      optimizations.push('Consider breaking down into smaller modules');
    } else if (complexity.overall === 'simple') {
      aiModels.push('phi3.5:3.8b'); // Smaller, faster model for simple projects
    }

    // Framework-specific recommendations
    if (frameworks.some(fw => fw.name === 'react')) {
      patterns.push('Use React hooks for state management');
      patterns.push('Consider TypeScript for better type safety');
    }

    // Project type recommendations
    if (projectType === 'web') {
      optimizations.push('Implement proper SEO optimization');
      optimizations.push('Add performance monitoring');
    }

    return {
      aiModels: [...new Set(aiModels)],
      optimizations,
      patterns
    };
  }

  private async readPackageJson(projectPath: string): Promise<any> {
    try {
      const packagePath = path.join(projectPath, 'package.json');
      const content = await fs.readFile(packagePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }
}

// Export singleton instance
export const projectAnalyzer = new ProjectAnalyzer();