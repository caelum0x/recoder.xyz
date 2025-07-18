/**
 * Project detection and analysis utilities
 */

import path from 'path';
import { FileSystemUtils } from './filesystem';
import { Logger } from '@recoder/shared';

export interface ProjectFramework {
  name: string;
  type: 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'desktop' | 'library';
  confidence: number; // 0-1
  version?: string;
  configFiles: string[];
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'composer' | 'maven' | 'gradle';
}

export interface ProjectLanguage {
  name: string;
  files: number;
  percentage: number;
  extensions: string[];
}

export interface ProjectStructure {
  hasSource: boolean;
  hasTests: boolean;
  hasDocs: boolean;
  hasConfig: boolean;
  hasBuild: boolean;
  directories: {
    source: string[];
    tests: string[];
    docs: string[];
    config: string[];
    build: string[];
  };
}

export interface ProjectInfo {
  name: string;
  path: string;
  type: 'web' | 'mobile' | 'desktop' | 'api' | 'library' | 'monorepo' | 'unknown';
  frameworks: ProjectFramework[];
  languages: ProjectLanguage[];
  structure: ProjectStructure;
  packageManager: string | null;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  size: number;
  lastModified: Date;
}

export class ProjectDetector {
  private static readonly FRAMEWORK_PATTERNS = {
    // Frontend Frameworks
    'React': {
      type: 'frontend' as const,
      patterns: [
        { file: 'package.json', contains: ['react'] },
        { file: '**/*.{js,jsx,ts,tsx}', contains: ['import React', 'from "react"', 'from \'react\''] },
      ],
    },
    'Vue.js': {
      type: 'frontend' as const,
      patterns: [
        { file: 'package.json', contains: ['vue'] },
        { file: '**/*.vue', exists: true },
        { file: 'vue.config.js', exists: true },
      ],
    },
    'Angular': {
      type: 'frontend' as const,
      patterns: [
        { file: 'package.json', contains: ['@angular/core'] },
        { file: 'angular.json', exists: true },
        { file: '**/*.component.ts', exists: true },
      ],
    },
    'Svelte': {
      type: 'frontend' as const,
      patterns: [
        { file: 'package.json', contains: ['svelte'] },
        { file: '**/*.svelte', exists: true },
      ],
    },
    'Next.js': {
      type: 'fullstack' as const,
      patterns: [
        { file: 'package.json', contains: ['next'] },
        { file: 'next.config.js', exists: true },
        { file: 'pages/**/*.{js,jsx,ts,tsx}', exists: true },
      ],
    },
    'Nuxt.js': {
      type: 'fullstack' as const,
      patterns: [
        { file: 'package.json', contains: ['nuxt'] },
        { file: 'nuxt.config.{js,ts}', exists: true },
      ],
    },
    
    // Backend Frameworks
    'Express.js': {
      type: 'backend' as const,
      patterns: [
        { file: 'package.json', contains: ['express'] },
        { file: '**/*.{js,ts}', contains: ['express()', 'require("express")', 'from "express"'] },
      ],
    },
    'Fastify': {
      type: 'backend' as const,
      patterns: [
        { file: 'package.json', contains: ['fastify'] },
        { file: '**/*.{js,ts}', contains: ['fastify()', 'require("fastify")'] },
      ],
    },
    'NestJS': {
      type: 'backend' as const,
      patterns: [
        { file: 'package.json', contains: ['@nestjs/core'] },
        { file: '**/*.module.ts', exists: true },
        { file: 'nest-cli.json', exists: true },
      ],
    },
    'Django': {
      type: 'backend' as const,
      patterns: [
        { file: 'requirements.txt', contains: ['Django'] },
        { file: 'manage.py', exists: true },
        { file: '**/settings.py', exists: true },
      ],
    },
    'Flask': {
      type: 'backend' as const,
      patterns: [
        { file: 'requirements.txt', contains: ['Flask'] },
        { file: '**/*.py', contains: ['from flask import', 'import flask'] },
      ],
    },
    'FastAPI': {
      type: 'backend' as const,
      patterns: [
        { file: 'requirements.txt', contains: ['fastapi'] },
        { file: '**/*.py', contains: ['from fastapi import', 'import fastapi'] },
      ],
    },
    'Spring Boot': {
      type: 'backend' as const,
      patterns: [
        { file: 'pom.xml', contains: ['spring-boot'] },
        { file: 'build.gradle', contains: ['spring-boot'] },
        { file: '**/*.java', contains: ['@SpringBootApplication'] },
      ],
    },

    // Mobile Frameworks
    'React Native': {
      type: 'mobile' as const,
      patterns: [
        { file: 'package.json', contains: ['react-native'] },
        { file: 'metro.config.js', exists: true },
        { file: 'android/**', exists: true },
        { file: 'ios/**', exists: true },
      ],
    },
    'Flutter': {
      type: 'mobile' as const,
      patterns: [
        { file: 'pubspec.yaml', exists: true },
        { file: '**/*.dart', exists: true },
        { file: 'android/**', exists: true },
        { file: 'ios/**', exists: true },
      ],
    },
    'Ionic': {
      type: 'mobile' as const,
      patterns: [
        { file: 'package.json', contains: ['@ionic/angular', '@ionic/react', '@ionic/vue'] },
        { file: 'ionic.config.json', exists: true },
      ],
    },

    // Build Tools & Bundlers
    'Webpack': {
      type: 'frontend' as const,
      patterns: [
        { file: 'webpack.config.js', exists: true },
        { file: 'package.json', contains: ['webpack'] },
      ],
    },
    'Vite': {
      type: 'frontend' as const,
      patterns: [
        { file: 'vite.config.{js,ts}', exists: true },
        { file: 'package.json', contains: ['vite'] },
      ],
    },
    'Rollup': {
      type: 'frontend' as const,
      patterns: [
        { file: 'rollup.config.js', exists: true },
        { file: 'package.json', contains: ['rollup'] },
      ],
    },
  };

  private static readonly LANGUAGE_EXTENSIONS = {
    'JavaScript': ['.js', '.mjs', '.cjs'],
    'TypeScript': ['.ts', '.tsx'],
    'Python': ['.py', '.pyw'],
    'Java': ['.java'],
    'C#': ['.cs'],
    'C++': ['.cpp', '.cc', '.cxx'],
    'C': ['.c'],
    'Go': ['.go'],
    'Rust': ['.rs'],
    'PHP': ['.php'],
    'Ruby': ['.rb'],
    'Swift': ['.swift'],
    'Kotlin': ['.kt'],
    'Dart': ['.dart'],
    'HTML': ['.html', '.htm'],
    'CSS': ['.css'],
    'SCSS': ['.scss'],
    'SASS': ['.sass'],
    'Less': ['.less'],
    'JSON': ['.json'],
    'YAML': ['.yaml', '.yml'],
    'XML': ['.xml'],
    'Markdown': ['.md'],
    'Shell': ['.sh', '.bash'],
    'SQL': ['.sql'],
  };

  private static readonly SOURCE_DIRECTORIES = [
    'src', 'source', 'lib', 'app', 'components', 'pages', 'views', 'controllers',
    'models', 'services', 'utils', 'helpers', 'hooks', 'store', 'styles', 'assets',
  ];

  private static readonly TEST_DIRECTORIES = [
    'test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'cypress', 'jest',
  ];

  private static readonly DOCS_DIRECTORIES = [
    'docs', 'documentation', 'guide', 'guides', 'examples', 'samples',
  ];

  private static readonly CONFIG_DIRECTORIES = [
    'config', 'configs', 'configuration', 'settings', '.vscode', '.github',
  ];

  private static readonly BUILD_DIRECTORIES = [
    'build', 'dist', 'out', 'target', 'bin', 'public', 'static', 'assets',
  ];

  /**
   * Detect project information from directory
   */
  static async detectProject(projectPath: string): Promise<ProjectInfo | null> {
    try {
      if (!await FileSystemUtils.exists(projectPath)) {
        return null;
      }

      const packageInfo = await this.getPackageInfo(projectPath);
      const frameworks = await this.detectFrameworks(projectPath);
      const languages = await this.detectLanguages(projectPath);
      const structure = await this.analyzeStructure(projectPath);
      const size = await FileSystemUtils.getDirectorySize(projectPath);
      const stats = await FileSystemUtils.getFileInfo(projectPath);

      const projectInfo: ProjectInfo = {
        name: packageInfo?.name || path.basename(projectPath),
        path: projectPath,
        type: this.determineProjectType(frameworks, structure),
        frameworks,
        languages,
        structure,
        packageManager: await this.detectPackageManager(projectPath),
        dependencies: packageInfo?.dependencies || {},
        devDependencies: packageInfo?.devDependencies || {},
        scripts: packageInfo?.scripts || {},
        size,
        lastModified: stats?.lastModified || new Date(),
      };

      return projectInfo;
    } catch (error) {
      Logger.error(`Failed to detect project info: ${error}`);
      return null;
    }
  }

  /**
   * Detect frameworks used in the project
   */
  private static async detectFrameworks(projectPath: string): Promise<ProjectFramework[]> {
    const frameworks: ProjectFramework[] = [];

    for (const [name, config] of Object.entries(this.FRAMEWORK_PATTERNS)) {
      let confidence = 0;
      const configFiles: string[] = [];

      for (const pattern of config.patterns) {
        if (pattern.exists) {
          const files = await FileSystemUtils.searchFiles(projectPath, {
            pattern: pattern.file,
            maxDepth: 3,
          });
          
          if (files.length > 0) {
            confidence += 0.3;
            configFiles.push(...files);
          }
        }

        if (pattern.contains) {
          const files = await FileSystemUtils.findInFiles(projectPath, pattern.contains[0], {
            pattern: pattern.file,
            maxDepth: 3,
          });
          
          if (files.length > 0) {
            confidence += 0.4;
          }
        }
      }

      if (confidence > 0.3) {
        frameworks.push({
          name,
          type: config.type,
          confidence: Math.min(confidence, 1),
          configFiles: [...new Set(configFiles)],
        });
      }
    }

    return frameworks.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Detect programming languages used in the project
   */
  private static async detectLanguages(projectPath: string): Promise<ProjectLanguage[]> {
    const languageCounts: Record<string, number> = {};
    const languageExtensions: Record<string, Set<string>> = {};

    for (const [language, extensions] of Object.entries(this.LANGUAGE_EXTENSIONS)) {
      languageCounts[language] = 0;
      languageExtensions[language] = new Set();

      for (const ext of extensions) {
        const files = await FileSystemUtils.searchFiles(projectPath, {
          pattern: `**/*${ext}`,
          excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage'],
        });

        languageCounts[language] += files.length;
        if (files.length > 0) {
          languageExtensions[language].add(ext);
        }
      }
    }

    const totalFiles = Object.values(languageCounts).reduce((sum, count) => sum + count, 0);
    
    if (totalFiles === 0) {
      return [];
    }

    return Object.entries(languageCounts)
      .filter(([, count]) => count > 0)
      .map(([language, count]) => ({
        name: language,
        files: count,
        percentage: Math.round((count / totalFiles) * 100),
        extensions: Array.from(languageExtensions[language]),
      }))
      .sort((a, b) => b.files - a.files);
  }

  /**
   * Analyze project directory structure
   */
  private static async analyzeStructure(projectPath: string): Promise<ProjectStructure> {
    const directories = await FileSystemUtils.listDirectory(projectPath, { recursive: false });
    
    const structure: ProjectStructure = {
      hasSource: false,
      hasTests: false,
      hasDocs: false,
      hasConfig: false,
      hasBuild: false,
      directories: {
        source: [],
        tests: [],
        docs: [],
        config: [],
        build: [],
      },
    };

    for (const dir of directories) {
      const dirPath = path.join(projectPath, dir);
      const isDirectory = (await FileSystemUtils.getFileInfo(dirPath))?.isDirectory;
      
      if (!isDirectory) continue;

      if (this.SOURCE_DIRECTORIES.includes(dir.toLowerCase())) {
        structure.hasSource = true;
        structure.directories.source.push(dir);
      }
      
      if (this.TEST_DIRECTORIES.includes(dir.toLowerCase())) {
        structure.hasTests = true;
        structure.directories.tests.push(dir);
      }
      
      if (this.DOCS_DIRECTORIES.includes(dir.toLowerCase())) {
        structure.hasDocs = true;
        structure.directories.docs.push(dir);
      }
      
      if (this.CONFIG_DIRECTORIES.includes(dir.toLowerCase())) {
        structure.hasConfig = true;
        structure.directories.config.push(dir);
      }
      
      if (this.BUILD_DIRECTORIES.includes(dir.toLowerCase())) {
        structure.hasBuild = true;
        structure.directories.build.push(dir);
      }
    }

    return structure;
  }

  /**
   * Detect package manager used in the project
   */
  private static async detectPackageManager(projectPath: string): Promise<string | null> {
    const lockFiles = [
      { file: 'package-lock.json', manager: 'npm' },
      { file: 'yarn.lock', manager: 'yarn' },
      { file: 'pnpm-lock.yaml', manager: 'pnpm' },
      { file: 'bun.lockb', manager: 'bun' },
      { file: 'requirements.txt', manager: 'pip' },
      { file: 'Pipfile', manager: 'pipenv' },
      { file: 'composer.lock', manager: 'composer' },
      { file: 'pom.xml', manager: 'maven' },
      { file: 'build.gradle', manager: 'gradle' },
      { file: 'Cargo.lock', manager: 'cargo' },
      { file: 'go.mod', manager: 'go' },
    ];

    for (const { file, manager } of lockFiles) {
      if (await FileSystemUtils.exists(path.join(projectPath, file))) {
        return manager;
      }
    }

    return null;
  }

  /**
   * Get package.json information
   */
  private static async getPackageInfo(projectPath: string): Promise<any> {
    const packagePath = path.join(projectPath, 'package.json');
    return await FileSystemUtils.readJSON(packagePath);
  }

  /**
   * Determine project type based on frameworks and structure
   */
  private static determineProjectType(frameworks: ProjectFramework[], structure: ProjectStructure): ProjectInfo['type'] {
    // Check for monorepo
    if (structure.directories.source.some(dir => ['packages', 'apps', 'libs'].includes(dir))) {
      return 'monorepo';
    }

    // Check framework types
    const frameworkTypes = frameworks.map(f => f.type);
    
    if (frameworkTypes.includes('mobile')) {
      return 'mobile';
    }
    
    if (frameworkTypes.includes('fullstack')) {
      return 'web';
    }
    
    if (frameworkTypes.includes('frontend')) {
      return 'web';
    }
    
    if (frameworkTypes.includes('backend')) {
      return 'api';
    }

    // Check for desktop frameworks
    if (frameworks.some(f => ['Electron', 'Tauri', 'Qt'].includes(f.name))) {
      return 'desktop';
    }

    // Check for library indicators
    if (structure.directories.source.some(dir => ['lib', 'library'].includes(dir))) {
      return 'library';
    }

    return 'unknown';
  }

  /**
   * Check if directory is a valid project
   */
  static async isProject(projectPath: string): Promise<boolean> {
    const indicators = [
      'package.json',
      'requirements.txt',
      'pom.xml',
      'build.gradle',
      'Cargo.toml',
      'go.mod',
      'composer.json',
      'pubspec.yaml',
    ];

    for (const indicator of indicators) {
      if (await FileSystemUtils.exists(path.join(projectPath, indicator))) {
        return true;
      }
    }

    // Check for common source directories
    for (const dir of this.SOURCE_DIRECTORIES.slice(0, 3)) { // Check top 3 most common
      if (await FileSystemUtils.exists(path.join(projectPath, dir))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find all projects in a directory tree
   */
  static async findProjects(searchPath: string, maxDepth: number = 3): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = [];
    
    try {
      await this.findProjectsRecursive(searchPath, projects, 0, maxDepth);
    } catch (error) {
      Logger.error(`Failed to find projects: ${error}`);
    }

    return projects;
  }

  private static async findProjectsRecursive(
    currentPath: string, 
    projects: ProjectInfo[], 
    depth: number, 
    maxDepth: number
  ): Promise<void> {
    if (depth > maxDepth) return;

    if (await this.isProject(currentPath)) {
      const projectInfo = await this.detectProject(currentPath);
      if (projectInfo) {
        projects.push(projectInfo);
      }
      return; // Don't search deeper in project directories
    }

    try {
      const items = await FileSystemUtils.listDirectory(currentPath);
      
      for (const item of items) {
        if (item.startsWith('.')) continue; // Skip hidden directories
        
        const itemPath = path.join(currentPath, item);
        const isDirectory = (await FileSystemUtils.getFileInfo(itemPath))?.isDirectory;
        
        if (isDirectory) {
          await this.findProjectsRecursive(itemPath, projects, depth + 1, maxDepth);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
}