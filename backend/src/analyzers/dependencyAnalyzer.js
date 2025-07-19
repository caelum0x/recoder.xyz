const { BaseAnalyzer } = require('./baseAnalyzer');
const { ASTParser } = require('../utils/ast-parser');
const { FileUtils } = require('../utils/file-utils');
const { logger } = require('../utils/logger');
const path = require('path');

class DependencyAnalyzer extends BaseAnalyzer {
  constructor(options = {}) {
    super(options);
    this.supportedFiles = ['.js', '.ts', '.jsx', '.tsx', '.json'];
    this.packageManagers = ['npm', 'yarn', 'pnpm'];
  }

  async analyze(input, context = {}) {
    try {
      const { projectPath, files, packageJson } = input;
      
      const analysis = await this.performAsyncAnalysis(input, async () => {
        const results = {
          packages: await this.analyzePackageDependencies(packageJson || projectPath),
          imports: await this.analyzeImportDependencies(files || projectPath),
          circular: await this.detectCircularDependencies(files || projectPath),
          unused: await this.findUnusedDependencies(projectPath, packageJson),
          outdated: await this.checkOutdatedDependencies(packageJson || projectPath),
          security: await this.analyzeSecurityVulnerabilities(packageJson || projectPath),
          tree: await this.buildDependencyTree(packageJson || projectPath)
        };

        results.summary = this.generateDependencySummary(results);
        results.metrics = this.generateMetrics(results);
        results.recommendations = this.generateRecommendations(results);
        
        return results;
      });

      return this.createAnalysisResult(analysis, {
        analysisType: 'dependencies',
        projectPath: typeof input === 'string' ? input : input.projectPath
      });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  async analyzePackageDependencies(packageJsonPath) {
    try {
      let packageJson;
      
      if (typeof packageJsonPath === 'string') {
        const filePath = packageJsonPath.endsWith('package.json') 
          ? packageJsonPath 
          : path.join(packageJsonPath, 'package.json');
        packageJson = await FileUtils.readJSONFile(filePath);
      } else {
        packageJson = packageJsonPath;
      }

      if (!packageJson) {
        return { dependencies: {}, devDependencies: {}, peerDependencies: {} };
      }

      const analysis = {
        production: this.analyzeDependencyGroup(packageJson.dependencies || {}),
        development: this.analyzeDependencyGroup(packageJson.devDependencies || {}),
        peer: this.analyzeDependencyGroup(packageJson.peerDependencies || {}),
        optional: this.analyzeDependencyGroup(packageJson.optionalDependencies || {}),
        bundled: packageJson.bundledDependencies || []
      };

      analysis.total = {
        count: analysis.production.count + analysis.development.count + analysis.peer.count,
        size: this.estimateBundleSize(packageJson.dependencies || {})
      };

      return analysis;
    } catch (error) {
      logger.error('Package dependency analysis failed:', error);
      return {};
    }
  }

  analyzeDependencyGroup(dependencies) {
    const packages = Object.entries(dependencies);
    
    return {
      count: packages.length,
      packages: packages.map(([name, version]) => ({
        name,
        version,
        type: this.classifyPackage(name),
        versionType: this.classifyVersion(version)
      })),
      categories: this.categorizeDependencies(packages)
    };
  }

  classifyPackage(packageName) {
    const typePatterns = {
      framework: /^(react|vue|angular|svelte|next|nuxt|gatsby)$/i,
      ui: /^(@mui|antd|chakra|semantic|bootstrap|tailwind)/i,
      utility: /^(lodash|ramda|uuid|moment|date-fns|axios)$/i,
      build: /^(webpack|vite|rollup|parcel|babel|esbuild)$/i,
      test: /^(jest|mocha|cypress|playwright|vitest)$/i,
      lint: /^(eslint|prettier|stylelint|tslint)$/i,
      types: /^@types\//i,
      babel: /^@babel\//i,
      webpack: /^webpack|^@webpack/i
    };

    for (const [type, pattern] of Object.entries(typePatterns)) {
      if (pattern.test(packageName)) {
        return type;
      }
    }

    return 'other';
  }

  classifyVersion(version) {
    if (version.startsWith('^')) return 'caret';
    if (version.startsWith('~')) return 'tilde';
    if (version.includes('-')) return 'prerelease';
    if (version === 'latest') return 'latest';
    if (/^\d+\.\d+\.\d+$/.test(version)) return 'exact';
    return 'range';
  }

  categorizeDependencies(packages) {
    const categories = {};
    
    for (const [name] of packages) {
      const type = this.classifyPackage(name);
      categories[type] = (categories[type] || 0) + 1;
    }
    
    return categories;
  }

  estimateBundleSize(dependencies) {
    // Rough estimation based on common package sizes
    const sizeEstimates = {
      react: 42000,
      'react-dom': 130000,
      vue: 130000,
      angular: 500000,
      lodash: 70000,
      moment: 67000,
      axios: 13000
    };

    let totalSize = 0;
    for (const packageName of Object.keys(dependencies)) {
      totalSize += sizeEstimates[packageName] || 10000; // Default 10KB
    }

    return {
      estimated: totalSize,
      formatted: this.formatBytes(totalSize)
    };
  }

  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  async analyzeImportDependencies(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { 
          recursive: true,
          extension: '.js'
        });
        // Also get .ts, .jsx, .tsx files
        for (const ext of ['.ts', '.jsx', '.tsx']) {
          const extFiles = await FileUtils.listFiles(filesOrPath, { 
            recursive: true,
            extension: ext
          });
          files.push(...extFiles);
        }
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const importAnalysis = {
        internal: [],
        external: [],
        relative: [],
        absolute: [],
        dynamics: [],
        unused: []
      };

      for (const file of files) {
        if (!this.supportedFiles.includes(path.extname(file))) {
          continue;
        }

        const content = await FileUtils.readFile(file);
        if (!content) continue;

        const fileImports = this.extractImportsFromFile(content, file);
        
        importAnalysis.internal.push(...fileImports.internal);
        importAnalysis.external.push(...fileImports.external);
        importAnalysis.relative.push(...fileImports.relative);
        importAnalysis.absolute.push(...fileImports.absolute);
        importAnalysis.dynamics.push(...fileImports.dynamic);
      }

      // Remove duplicates and add metrics
      for (const key of Object.keys(importAnalysis)) {
        importAnalysis[key] = this.deduplicateImports(importAnalysis[key]);
      }

      importAnalysis.graph = this.buildImportGraph(importAnalysis);
      importAnalysis.metrics = this.calculateImportMetrics(importAnalysis);

      return importAnalysis;
    } catch (error) {
      logger.error('Import dependency analysis failed:', error);
      return {};
    }
  }

  extractImportsFromFile(content, filePath) {
    const imports = {
      internal: [],
      external: [],
      relative: [],
      absolute: [],
      dynamic: []
    };

    try {
      // Try to parse with AST parser
      const astImports = ASTParser.extractImports(content);
      
      for (const imp of astImports) {
        const importInfo = {
          source: imp.source,
          file: filePath,
          specifiers: imp.specifiers,
          line: imp.line
        };

        if (imp.source.startsWith('./') || imp.source.startsWith('../')) {
          imports.relative.push(importInfo);
          imports.internal.push(importInfo);
        } else if (imp.source.startsWith('/')) {
          imports.absolute.push(importInfo);
          imports.internal.push(importInfo);
        } else {
          imports.external.push(importInfo);
        }
      }

      // Also check for dynamic imports
      const dynamicPattern = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
      let match;
      while ((match = dynamicPattern.exec(content)) !== null) {
        imports.dynamic.push({
          source: match[1],
          file: filePath,
          type: 'dynamic'
        });
      }

    } catch (error) {
      // Fallback to regex-based extraction
      logger.warn(`AST parsing failed for ${filePath}, using regex fallback`);
      const regexImports = this.extractImportsWithRegex(content, filePath);
      Object.assign(imports, regexImports);
    }

    return imports;
  }

  extractImportsWithRegex(content, filePath) {
    const imports = {
      internal: [],
      external: [],
      relative: [],
      absolute: [],
      dynamic: []
    };

    // ES6 imports
    const importPattern = /import\s+(?:[^'"]*from\s+)?['"`]([^'"`)]+)['"`]/g;
    // CommonJS requires
    const requirePattern = /require\s*\(\s*['"`]([^'")`]+)['"`]\s*\)/g;

    const patterns = [importPattern, requirePattern];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const source = match[1];
        const importInfo = {
          source,
          file: filePath
        };

        if (source.startsWith('./') || source.startsWith('../')) {
          imports.relative.push(importInfo);
          imports.internal.push(importInfo);
        } else if (source.startsWith('/')) {
          imports.absolute.push(importInfo);
          imports.internal.push(importInfo);
        } else {
          imports.external.push(importInfo);
        }
      }
    }

    return imports;
  }

  deduplicateImports(imports) {
    const seen = new Set();
    return imports.filter(imp => {
      const key = `${imp.file}:${imp.source}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  buildImportGraph(importAnalysis) {
    const graph = {
      nodes: new Set(),
      edges: []
    };

    const allImports = [
      ...importAnalysis.internal,
      ...importAnalysis.external
    ];

    for (const imp of allImports) {
      graph.nodes.add(imp.file);
      graph.nodes.add(imp.source);
      graph.edges.push({
        from: imp.file,
        to: imp.source,
        type: 'import'
      });
    }

    graph.nodes = Array.from(graph.nodes);
    return graph;
  }

  calculateImportMetrics(importAnalysis) {
    const metrics = {
      totalImports: 0,
      internalImports: importAnalysis.internal.length,
      externalImports: importAnalysis.external.length,
      relativeImports: importAnalysis.relative.length,
      absoluteImports: importAnalysis.absolute.length,
      dynamicImports: importAnalysis.dynamics.length
    };

    metrics.totalImports = metrics.internalImports + metrics.externalImports;
    metrics.internalRatio = metrics.totalImports > 0 
      ? Math.round((metrics.internalImports / metrics.totalImports) * 100)
      : 0;

    return metrics;
  }

  async detectCircularDependencies(filesOrPath) {
    try {
      const importAnalysis = await this.analyzeImportDependencies(filesOrPath);
      const graph = importAnalysis.graph;
      
      const circularDeps = this.findCycles(graph);
      
      return {
        found: circularDeps.length > 0,
        cycles: circularDeps,
        count: circularDeps.length,
        severity: this.assessCircularSeverity(circularDeps)
      };
    } catch (error) {
      logger.error('Circular dependency detection failed:', error);
      return { found: false, cycles: [], count: 0 };
    }
  }

  findCycles(graph) {
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];

    const dfs = (node, path = []) => {
      if (recursionStack.has(node)) {
        // Found a cycle
        const cycleStart = path.indexOf(node);
        const cycle = path.slice(cycleStart);
        cycles.push(cycle);
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const edges = graph.edges.filter(edge => edge.from === node);
      for (const edge of edges) {
        dfs(edge.to, [...path]);
      }

      recursionStack.delete(node);
    };

    for (const node of graph.nodes) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  assessCircularSeverity(cycles) {
    if (cycles.length === 0) return 'none';
    if (cycles.length <= 2) return 'low';
    if (cycles.length <= 5) return 'medium';
    return 'high';
  }

  async findUnusedDependencies(projectPath, packageJson) {
    // This is a simplified implementation
    // In practice, you'd need more sophisticated analysis
    try {
      const pkg = packageJson || await FileUtils.readJSONFile(
        path.join(projectPath, 'package.json')
      );
      
      if (!pkg || !pkg.dependencies) {
        return [];
      }

      const importAnalysis = await this.analyzeImportDependencies(projectPath);
      const usedPackages = new Set(
        importAnalysis.external.map(imp => imp.source.split('/')[0])
      );

      const unusedDeps = [];
      for (const depName of Object.keys(pkg.dependencies)) {
        if (!usedPackages.has(depName)) {
          unusedDeps.push({
            name: depName,
            version: pkg.dependencies[depName],
            type: 'dependency'
          });
        }
      }

      return unusedDeps;
    } catch (error) {
      logger.error('Unused dependency detection failed:', error);
      return [];
    }
  }

  async checkOutdatedDependencies(packageJsonPath) {
    // Mock implementation - in practice would check npm registry
    return {
      outdated: [],
      upToDate: [],
      vulnerable: []
    };
  }

  async analyzeSecurityVulnerabilities(packageJsonPath) {
    // Mock implementation - in practice would use npm audit or similar
    return {
      vulnerabilities: [],
      severity: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0
      },
      recommendations: []
    };
  }

  async buildDependencyTree(packageJsonPath) {
    // Simplified dependency tree
    try {
      const pkg = typeof packageJsonPath === 'string' 
        ? await FileUtils.readJSONFile(
            packageJsonPath.endsWith('package.json') 
              ? packageJsonPath 
              : path.join(packageJsonPath, 'package.json')
          )
        : packageJsonPath;

      if (!pkg) return {};

      const tree = {
        name: pkg.name,
        version: pkg.version,
        dependencies: {}
      };

      for (const [name, version] of Object.entries(pkg.dependencies || {})) {
        tree.dependencies[name] = {
          version,
          dependencies: {} // Would recursively populate in full implementation
        };
      }

      return tree;
    } catch (error) {
      logger.error('Dependency tree building failed:', error);
      return {};
    }
  }

  generateDependencySummary(analysis) {
    const totalDeps = analysis.packages?.total?.count || 0;
    const circularCount = analysis.circular?.count || 0;
    const unusedCount = analysis.unused?.length || 0;

    return {
      overview: `Found ${totalDeps} total dependencies with ${circularCount} circular dependencies and ${unusedCount} unused packages`,
      health: this.assessDependencyHealth(analysis),
      bundleSize: analysis.packages?.total?.size?.formatted || 'Unknown',
      recommendations: this.generateRecommendations(analysis)
    };
  }

  assessDependencyHealth(analysis) {
    let score = 100;
    
    if (analysis.circular?.count > 0) {
      score -= analysis.circular.count * 10;
    }
    
    if (analysis.unused?.length > 5) {
      score -= 20;
    }
    
    if (analysis.packages?.total?.count > 100) {
      score -= 15;
    }
    
    return Math.max(0, score);
  }

  generateRecommendations(analysis) {
    const recommendations = [];
    
    if (analysis.circular?.count > 0) {
      recommendations.push({
        type: 'circular',
        priority: 'high',
        message: 'Resolve circular dependencies to improve maintainability'
      });
    }
    
    if (analysis.unused?.length > 3) {
      recommendations.push({
        type: 'cleanup',
        priority: 'medium',
        message: `Remove ${analysis.unused.length} unused dependencies to reduce bundle size`
      });
    }
    
    if (analysis.packages?.total?.count > 50) {
      recommendations.push({
        type: 'optimization',
        priority: 'low',
        message: 'Consider consolidating dependencies or using lighter alternatives'
      });
    }
    
    return recommendations;
  }
}

module.exports = { DependencyAnalyzer };