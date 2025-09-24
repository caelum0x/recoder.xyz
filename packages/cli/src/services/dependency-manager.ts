/**
 * Dependency Manager for Multi-File Generation and Integration
 */

import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { Logger } from 'recoder-shared';
import {
  GeneratedFile,
  FileDependency,
  FileImport,
  FileExport,
  GenerationRequest,
  ProjectContext
} from 'recoder-shared/types/code-generation';

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  cycles: string[][];
  orphans: string[];
}

export interface DependencyNode {
  id: string;
  filePath: string;
  type: 'source' | 'test' | 'config' | 'documentation';
  exports: FileExport[];
  imports: FileImport[];
  dependencies: FileDependency[];
  dependents: string[];
  level: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'dependency' | 'test';
  strength: 'weak' | 'strong';
}

export interface PackageUpdate {
  name: string;
  currentVersion?: string;
  targetVersion: string;
  type: 'add' | 'update' | 'remove';
  reason: string;
}

export interface ImportOptimization {
  file: string;
  suggestions: ImportSuggestion[];
  duplicates: string[];
  unused: string[];
}

export interface ImportSuggestion {
  current: string;
  suggested: string;
  reason: string;
  impact: 'performance' | 'maintainability' | 'bundleSize';
}

export class DependencyManager {
  private projectContext: ProjectContext | null = null;
  private dependencyGraph: DependencyGraph | null = null;

  constructor() {
  }

  public async initialize(projectContext: ProjectContext): Promise<void> {
    this.projectContext = projectContext;
    Logger.info('Dependency manager initialized', { 
      project: projectContext.name,
      packageManager: projectContext.packageManager 
    });
  }

  public async manageDependencies(
    generatedFiles: GeneratedFile[], 
    request: GenerationRequest
  ): Promise<{
    packageUpdates: PackageUpdate[];
    importOptimizations: ImportOptimization[];
    configurationUpdates: any[];
    dependencyGraph: DependencyGraph;
  }> {
    Logger.info('Managing dependencies for generated files', { 
      fileCount: generatedFiles.length 
    });

    // Build dependency graph
    this.dependencyGraph = await this.buildDependencyGraph(generatedFiles);

    // Analyze required package updates
    const packageUpdates = await this.analyzePackageUpdates(generatedFiles);

    // Optimize imports
    const importOptimizations = await this.optimizeImports(generatedFiles);

    // Prepare configuration updates
    const configurationUpdates = await this.prepareConfigurationUpdates(generatedFiles, request);

    // Validate dependency graph for issues
    await this.validateDependencyGraph(this.dependencyGraph);

    return {
      packageUpdates,
      importOptimizations,
      configurationUpdates,
      dependencyGraph: this.dependencyGraph
    };
  }

  public async installDependencies(packageUpdates: PackageUpdate[]): Promise<void> {
    if (!this.projectContext) {
      throw new Error('Project context not initialized');
    }

    const { packageManager, rootPath } = this.projectContext;

    Logger.info('Installing dependencies', { 
      updates: packageUpdates.length,
      packageManager 
    });

    // Group updates by type
    const toAdd = packageUpdates.filter(u => u.type === 'add');
    const toUpdate = packageUpdates.filter(u => u.type === 'update');
    const toRemove = packageUpdates.filter(u => u.type === 'remove');

    // Install new dependencies
    if (toAdd.length > 0) {
      await this.installPackages(toAdd, packageManager, rootPath);
    }

    // Update existing dependencies
    if (toUpdate.length > 0) {
      await this.updatePackages(toUpdate, packageManager, rootPath);
    }

    // Remove unnecessary dependencies
    if (toRemove.length > 0) {
      await this.removePackages(toRemove, packageManager, rootPath);
    }

    Logger.info('Dependency installation completed');
  }

  public async optimizeProjectDependencies(): Promise<{
    removedUnused: string[];
    updatedOutdated: string[];
    securityFixes: string[];
    bundleSizeReduction: number;
  }> {
    if (!this.projectContext) {
      throw new Error('Project context not initialized');
    }

    Logger.info('Optimizing project dependencies');

    const result = {
      removedUnused: [] as string[],
      updatedOutdated: [] as string[],
      securityFixes: [] as string[],
      bundleSizeReduction: 0
    };

    // Find and remove unused dependencies
    const unusedDeps = await this.findUnusedDependencies();
    if (unusedDeps.length > 0) {
      await this.removePackages(
        unusedDeps.map(dep => ({ name: dep, type: 'remove' as const, targetVersion: '', reason: 'Unused dependency' })),
        this.projectContext.packageManager,
        this.projectContext.rootPath
      );
      result.removedUnused = unusedDeps;
    }

    // Update outdated dependencies
    const outdatedDeps = await this.findOutdatedDependencies();
    if (outdatedDeps.length > 0) {
      await this.updatePackages(outdatedDeps, this.projectContext.packageManager, this.projectContext.rootPath);
      result.updatedOutdated = outdatedDeps.map(d => d.name);
    }

    // Fix security vulnerabilities
    const securityFixes = await this.fixSecurityVulnerabilities();
    result.securityFixes = securityFixes;

    // Calculate bundle size reduction (simplified)
    result.bundleSizeReduction = (result.removedUnused.length * 50) + (result.updatedOutdated.length * 10);

    Logger.info('Dependency optimization completed', result);
    return result;
  }

  private async buildDependencyGraph(files: GeneratedFile[]): Promise<DependencyGraph> {
    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];

    // Create nodes for each file
    for (const file of files) {
      const node: DependencyNode = {
        id: file.path,
        filePath: file.path,
        type: file.type,
        exports: file.exports,
        imports: file.imports,
        dependencies: file.dependencies,
        dependents: [],
        level: 0
      };
      nodes.push(node);
    }

    // Create edges based on imports
    for (const file of files) {
      for (const importDecl of file.imports) {
        if (importDecl.source === 'local') {
          // Find the target file
          const targetFile = files.find(f => 
            f.path.includes(importDecl.module) || 
            path.basename(f.path) === importDecl.module + path.extname(f.path)
          );
          
          if (targetFile) {
            edges.push({
              from: file.path,
              to: targetFile.path,
              type: 'import',
              strength: importDecl.imports.length > 3 ? 'strong' : 'weak'
            });

            // Update dependents
            const targetNode = nodes.find(n => n.id === targetFile.path);
            if (targetNode && !targetNode.dependents.includes(file.path)) {
              targetNode.dependents.push(file.path);
            }
          }
        }
      }
    }

    // Calculate dependency levels
    this.calculateDependencyLevels(nodes, edges);

    // Detect cycles
    const cycles = this.detectCycles(nodes, edges);

    // Find orphan files
    const orphans = nodes
      .filter(node => node.imports.length === 0 && node.dependents.length === 0)
      .map(node => node.id);

    return { nodes, edges, cycles, orphans };
  }

  private calculateDependencyLevels(nodes: DependencyNode[], edges: DependencyEdge[]): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const calculateLevel = (nodeId: string): number => {
      if (visiting.has(nodeId)) {
        return 0; // Cycle detected, assign level 0
      }
      if (visited.has(nodeId)) {
        return nodes.find(n => n.id === nodeId)?.level || 0;
      }

      visiting.add(nodeId);
      
      const outgoingEdges = edges.filter(e => e.from === nodeId);
      let maxLevel = 0;
      
      for (const edge of outgoingEdges) {
        const targetLevel = calculateLevel(edge.to);
        maxLevel = Math.max(maxLevel, targetLevel + 1);
      }

      visiting.delete(nodeId);
      visited.add(nodeId);

      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        node.level = maxLevel;
      }

      return maxLevel;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        calculateLevel(node.id);
      }
    }
  }

  private detectCycles(nodes: DependencyNode[], edges: DependencyEdge[]): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): void => {
      if (stack.has(nodeId)) {
        // Cycle detected
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart).concat(nodeId));
        }
        return;
      }

      if (visited.has(nodeId)) {
        return;
      }

      visited.add(nodeId);
      stack.add(nodeId);
      path.push(nodeId);

      const outgoingEdges = edges.filter(e => e.from === nodeId);
      for (const edge of outgoingEdges) {
        dfs(edge.to);
      }

      stack.delete(nodeId);
      path.pop();
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    }

    return cycles;
  }

  private async analyzePackageUpdates(files: GeneratedFile[]): Promise<PackageUpdate[]> {
    const updates: PackageUpdate[] = [];
    const requiredDeps = new Map<string, { version: string; files: string[] }>();

    // Collect all dependencies from generated files
    for (const file of files) {
      for (const dep of file.dependencies) {
        if (dep.source === 'npm') {
          const existing = requiredDeps.get(dep.name);
          if (existing) {
            existing.files.push(file.path);
            // Use the latest version if multiple are specified
            if (dep.version && this.isNewerVersion(dep.version, existing.version)) {
              existing.version = dep.version;
            }
          } else {
            requiredDeps.set(dep.name, {
              version: dep.version || 'latest',
              files: [file.path]
            });
          }
        }
      }
    }

    // Check against existing package.json
    if (this.projectContext) {
      const packageJsonPath = path.join(this.projectContext.rootPath, 'package.json');
      
      try {
        const packageJson = await fs.readJson(packageJsonPath);
        const existingDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        for (const [depName, depInfo] of requiredDeps.entries()) {
          if (existingDeps[depName]) {
            // Check if update is needed
            if (this.isNewerVersion(depInfo.version, existingDeps[depName])) {
              updates.push({
                name: depName,
                currentVersion: existingDeps[depName],
                targetVersion: depInfo.version,
                type: 'update',
                reason: `Required by generated files: ${depInfo.files.join(', ')}`
              });
            }
          } else {
            // New dependency
            updates.push({
              name: depName,
              targetVersion: depInfo.version,
              type: 'add',
              reason: `Required by generated files: ${depInfo.files.join(', ')}`
            });
          }
        }
      } catch (error) {
        Logger.warn('Could not read package.json', { error });
      }
    }

    return updates;
  }

  private isNewerVersion(version1: string, version2: string): boolean {
    // Simplified version comparison
    if (version1 === 'latest') return true;
    if (version2 === 'latest') return false;
    
    const v1Parts = version1.replace(/[^\d.]/g, '').split('.').map(Number);
    const v2Parts = version2.replace(/[^\d.]/g, '').split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return true;
      if (v1Part < v2Part) return false;
    }
    
    return false;
  }

  private async optimizeImports(files: GeneratedFile[]): Promise<ImportOptimization[]> {
    const optimizations: ImportOptimization[] = [];

    for (const file of files) {
      const suggestions: ImportSuggestion[] = [];
      const duplicates: string[] = [];
      const unused: string[] = [];

      // Check for duplicate imports
      const importModules = file.imports.map(imp => imp.module);
      const duplicateModules = importModules.filter((module, index) => 
        importModules.indexOf(module) !== index
      );
      duplicates.push(...duplicateModules);

      // Suggest import optimizations
      for (const importDecl of file.imports) {
        // Suggest tree shaking for large libraries
        if (this.isLargeLibrary(importDecl.module) && importDecl.type === 'namespace') {
          suggestions.push({
            current: `import * as ${importDecl.module.replace(/[^a-zA-Z]/g, '')} from '${importDecl.module}'`,
            suggested: `import { ${importDecl.imports.join(', ')} } from '${importDecl.module}'`,
            reason: 'Tree shaking optimization for better bundle size',
            impact: 'bundleSize'
          });
        }

        // Suggest dynamic imports for code splitting
        if (this.shouldUseDynamicImport(importDecl.module, file)) {
          suggestions.push({
            current: `import { ${importDecl.imports.join(', ')} } from '${importDecl.module}'`,
            suggested: `const { ${importDecl.imports.join(', ')} } = await import('${importDecl.module}')`,
            reason: 'Code splitting optimization',
            impact: 'performance'
          });
        }
      }

      // Check for unused imports (simplified)
      for (const importDecl of file.imports) {
        const importUsed = importDecl.imports.some(imp => 
          file.content.includes(imp) && 
          file.content.indexOf(imp) > file.content.indexOf('import')
        );
        
        if (!importUsed) {
          unused.push(importDecl.module);
        }
      }

      if (suggestions.length > 0 || duplicates.length > 0 || unused.length > 0) {
        optimizations.push({
          file: file.path,
          suggestions,
          duplicates,
          unused
        });
      }
    }

    return optimizations;
  }

  private isLargeLibrary(module: string): boolean {
    const largeLibraries = [
      'lodash', 'moment', 'antd', 'material-ui', '@mui/material',
      'react-bootstrap', 'semantic-ui-react', 'chart.js'
    ];
    return largeLibraries.includes(module);
  }

  private shouldUseDynamicImport(module: string, file: GeneratedFile): boolean {
    // Suggest dynamic import for heavy libraries in non-critical files
    const heavyLibraries = ['chart.js', 'three', 'monaco-editor', 'pdf-lib'];
    const isHeavy = heavyLibraries.some(lib => module.includes(lib));
    const isNonCritical = !file.path.includes('critical') && !file.path.includes('main');
    
    return isHeavy && isNonCritical;
  }

  private async prepareConfigurationUpdates(
    files: GeneratedFile[], 
    request: GenerationRequest
  ): Promise<any[]> {
    const updates: any[] = [];

    // TypeScript configuration updates
    const hasTypeScript = files.some(f => f.language === 'TypeScript');
    if (hasTypeScript) {
      updates.push({
        file: 'tsconfig.json',
        type: 'typescript-config',
        changes: await this.generateTypeScriptConfig(files, request)
      });
    }

    // ESLint configuration updates
    const hasJavaScript = files.some(f => ['JavaScript', 'TypeScript'].includes(f.language));
    if (hasJavaScript) {
      updates.push({
        file: '.eslintrc.js',
        type: 'eslint-config',
        changes: await this.generateESLintConfig(files, request)
      });
    }

    // Build tool configuration
    if (this.projectContext?.buildSystem) {
      updates.push({
        file: this.getBuildConfigFile(this.projectContext.buildSystem),
        type: 'build-config',
        changes: await this.generateBuildConfig(files, request)
      });
    }

    return updates;
  }

  private async generateTypeScriptConfig(files: GeneratedFile[], request: GenerationRequest): Promise<any> {
    const hasReact = files.some(f => f.content.includes('react') || f.content.includes('jsx'));
    const hasNode = files.some(f => f.content.includes('require(') || f.content.includes('process.'));

    return {
      compilerOptions: {
        target: 'es2020',
        module: 'commonjs',
        lib: hasReact ? ['dom', 'es2020'] : ['es2020'],
        jsx: hasReact ? 'react-jsx' : undefined,
        declaration: true,
        outDir: './dist',
        rootDir: './src',
        strict: request.options.quality === 'enterprise',
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        experimentalDecorators: files.some(f => f.content.includes('@')),
        emitDecoratorMetadata: files.some(f => f.content.includes('@')),
        baseUrl: '.',
        paths: this.generatePathMappings(files)
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist', '**/*.test.*']
    };
  }

  private generatePathMappings(files: GeneratedFile[]): Record<string, string[]> {
    const paths: Record<string, string[]> = {};
    
    // Generate path mappings for internal modules
    for (const file of files) {
      const dir = path.dirname(file.path);
      const baseName = path.basename(file.path, path.extname(file.path));
      
      if (dir !== '.' && dir !== 'src') {
        const pathKey = `@${dir}/*`;
        const pathValue = `${dir}/*`;
        paths[pathKey] = [pathValue];
      }
    }

    return paths;
  }

  private async generateESLintConfig(files: GeneratedFile[], request: GenerationRequest): Promise<any> {
    const hasTypeScript = files.some(f => f.language === 'TypeScript');
    const hasReact = files.some(f => f.content.includes('react'));

    const config = {
      env: {
        browser: files.some(f => f.content.includes('window') || f.content.includes('document')),
        node: files.some(f => f.content.includes('process') || f.content.includes('require')),
        es2021: true
      },
      extends: [
        'eslint:recommended',
        ...(hasTypeScript ? ['@typescript-eslint/recommended'] : []),
        ...(hasReact ? ['plugin:react/recommended'] : [])
      ],
      parser: hasTypeScript ? '@typescript-eslint/parser' : 'espree',
      parserOptions: {
        ecmaVersion: 12,
        sourceType: 'module',
        ...(hasReact ? { ecmaFeatures: { jsx: true } } : {})
      },
      plugins: [
        ...(hasTypeScript ? ['@typescript-eslint'] : []),
        ...(hasReact ? ['react'] : [])
      ],
      rules: {
        // Security rules
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',
        
        // Quality rules based on generation options
        'complexity': ['warn', request.options.quality === 'enterprise' ? 5 : 10],
        'max-lines': ['warn', request.options.quality === 'enterprise' ? 200 : 500],
        'max-params': ['warn', request.options.quality === 'enterprise' ? 3 : 5]
      }
    };

    return config;
  }

  private getBuildConfigFile(buildSystem: string): string {
    const configFiles = {
      'webpack': 'webpack.config.js',
      'vite': 'vite.config.js',
      'rollup': 'rollup.config.js',
      'esbuild': 'esbuild.config.js'
    };
    
    return configFiles[buildSystem as keyof typeof configFiles] || 'build.config.js';
  }

  private async generateBuildConfig(files: GeneratedFile[], request: GenerationRequest): Promise<any> {
    // This would generate build-specific configuration
    // Implementation depends on the build system
    return {
      entry: this.findEntryPoints(files),
      optimization: {
        splitChunks: {
          chunks: 'all'
        },
        minimize: request.options.quality !== 'prototype'
      },
      performance: {
        maxAssetSize: request.options.performance === 'high_performance' ? 100000 : 250000,
        maxEntrypointSize: request.options.performance === 'high_performance' ? 100000 : 250000
      }
    };
  }

  private findEntryPoints(files: GeneratedFile[]): Record<string, string> {
    const entryPoints: Record<string, string> = {};
    
    for (const file of files) {
      // Look for main/index files or files with specific entry patterns
      const fileName = path.basename(file.path, path.extname(file.path));
      if (['index', 'main', 'app'].includes(fileName.toLowerCase()) ||
          file.content.includes('export default') ||
          file.content.includes('module.exports')) {
        entryPoints[fileName] = file.path;
      }
    }
    
    return Object.keys(entryPoints).length > 0 ? entryPoints : { main: 'src/index.js' };
  }

  private async validateDependencyGraph(graph: DependencyGraph): Promise<void> {
    // Report cycles
    if (graph.cycles.length > 0) {
      Logger.warn('Circular dependencies detected', { 
        cycles: graph.cycles.length,
        examples: graph.cycles.slice(0, 3)
      });
    }

    // Report orphaned files
    if (graph.orphans.length > 0) {
      Logger.warn('Orphaned files detected', { 
        orphans: graph.orphans.length,
        files: graph.orphans.slice(0, 5)
      });
    }

    // Validate dependency levels
    const maxLevel = Math.max(...graph.nodes.map(n => n.level));
    if (maxLevel > 10) {
      Logger.warn('Deep dependency nesting detected', { maxLevel });
    }
  }

  private async installPackages(packages: PackageUpdate[], packageManager: string, rootPath: string): Promise<void> {
    const packageNames = packages.map(p => 
      p.targetVersion === 'latest' ? p.name : `${p.name}@${p.targetVersion}`
    );

    const commands = {
      npm: ['install', ...packageNames],
      yarn: ['add', ...packageNames],
      pnpm: ['add', ...packageNames],
      bun: ['add', ...packageNames]
    };

    const command = commands[packageManager as keyof typeof commands] || commands.npm;
    await this.runPackageCommand(packageManager, command, rootPath);
  }

  private async updatePackages(packages: PackageUpdate[], packageManager: string, rootPath: string): Promise<void> {
    const packageNames = packages.map(p => 
      p.targetVersion === 'latest' ? p.name : `${p.name}@${p.targetVersion}`
    );

    const commands = {
      npm: ['update', ...packageNames],
      yarn: ['upgrade', ...packageNames],
      pnpm: ['update', ...packageNames],
      bun: ['update', ...packageNames]
    };

    const command = commands[packageManager as keyof typeof commands] || commands.npm;
    await this.runPackageCommand(packageManager, command, rootPath);
  }

  private async removePackages(packages: PackageUpdate[], packageManager: string, rootPath: string): Promise<void> {
    const packageNames = packages.map(p => p.name);

    const commands = {
      npm: ['uninstall', ...packageNames],
      yarn: ['remove', ...packageNames],
      pnpm: ['remove', ...packageNames],
      bun: ['remove', ...packageNames]
    };

    const command = commands[packageManager as keyof typeof commands] || commands.npm;
    await this.runPackageCommand(packageManager, command, rootPath);
  }

  private async runPackageCommand(packageManager: string, command: string[], rootPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(packageManager, command, {
        cwd: rootPath,
        stdio: 'inherit'
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Package command failed with code ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async findUnusedDependencies(): Promise<string[]> {
    // This would analyze the codebase to find unused dependencies
    // Simplified implementation
    return [];
  }

  private async findOutdatedDependencies(): Promise<PackageUpdate[]> {
    // This would check for outdated dependencies
    // Simplified implementation
    return [];
  }

  private async fixSecurityVulnerabilities(): Promise<string[]> {
    if (!this.projectContext) return [];

    const { packageManager, rootPath } = this.projectContext;

    try {
      const auditCommand = packageManager === 'npm' ? ['audit', 'fix'] : 
                          packageManager === 'yarn' ? ['audit', '--fix'] : 
                          ['audit', '--fix'];

      await this.runPackageCommand(packageManager, auditCommand, rootPath);
      return ['security-vulnerabilities-fixed'];
    } catch (error) {
      Logger.warn('Failed to fix security vulnerabilities', { error });
      return [];
    }
  }

  public getDependencyGraph(): DependencyGraph | null {
    return this.dependencyGraph;
  }

  public async generateDependencyReport(): Promise<{
    summary: any;
    graph: DependencyGraph | null;
    recommendations: string[];
  }> {
    const graph = this.getDependencyGraph();
    
    const summary = {
      totalFiles: graph?.nodes.length || 0,
      totalDependencies: graph?.edges.length || 0,
      cycles: graph?.cycles.length || 0,
      orphans: graph?.orphans.length || 0,
      maxDepth: graph ? Math.max(...graph.nodes.map(n => n.level)) : 0
    };

    const recommendations: string[] = [];
    
    if (summary.cycles > 0) {
      recommendations.push('Resolve circular dependencies to improve maintainability');
    }
    
    if (summary.orphans > 0) {
      recommendations.push('Consider removing or integrating orphaned files');
    }
    
    if (summary.maxDepth > 8) {
      recommendations.push('Consider flattening deep dependency hierarchies');
    }

    return { summary, graph, recommendations };
  }
}