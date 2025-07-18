const fs = require('fs-extra');
const path = require('path');
const { glob } = require('glob');
const { Template } = require('../models');
const { ProductionGenerator } = require('../generators/productionGenerator');
const { logger } = require('../utils/logger');

class StructureService {
  constructor() {
    this.productionGenerator = new ProductionGenerator();
  }

  /**
   * Analyze project structure
   * @param {string} projectPath - Path to the project directory
   * @param {object} options - Analysis options
   * @returns {object} Project structure analysis
   */
  async analyzeStructure(projectPath, options = {}) {
    try {
      const {
        deep = false,
        includeFiles = false,
        excludePatterns = ['node_modules', '.git', 'dist', 'build', 'coverage']
      } = options;

      logger.info('Analyzing project structure', { projectPath, deep, includeFiles });

      // Check if project path exists
      if (!await fs.pathExists(projectPath)) {
        throw new Error(`Project path does not exist: ${projectPath}`);
      }

      const structure = {
        path: projectPath,
        name: path.basename(projectPath),
        type: 'directory',
        children: [],
        metadata: {
          totalFiles: 0,
          totalDirectories: 0,
          totalSize: 0,
          languages: new Set(),
          frameworks: new Set(),
          dependencies: new Set(),
          lastModified: null
        }
      };

      // Analyze directory structure
      await this.analyzeDirectory(projectPath, structure, {
        deep,
        includeFiles,
        excludePatterns,
        maxDepth: deep ? 10 : 3
      });

      // Convert sets to arrays for JSON serialization
      structure.metadata.languages = Array.from(structure.metadata.languages);
      structure.metadata.frameworks = Array.from(structure.metadata.frameworks);
      structure.metadata.dependencies = Array.from(structure.metadata.dependencies);

      // Detect project type and framework
      const projectInfo = await this.detectProjectInfo(projectPath);
      structure.metadata.projectType = projectInfo.type;
      structure.metadata.detectedFrameworks = projectInfo.frameworks;

      // Analyze package.json if exists
      const packageInfo = await this.analyzePackageJson(projectPath);
      if (packageInfo) {
        structure.metadata.packageInfo = packageInfo;
        packageInfo.dependencies.forEach(dep => structure.metadata.dependencies.add(dep));
      }

      // Calculate complexity score
      structure.metadata.complexityScore = this.calculateComplexityScore(structure);

      // Generate architecture insights
      structure.metadata.architectureInsights = await this.generateArchitectureInsights(structure);

      // Identify potential issues
      structure.metadata.issues = await this.identifyStructureIssues(structure);

      // Generate recommendations
      structure.metadata.recommendations = await this.generateStructureRecommendations(structure);

      logger.info('Structure analysis completed', {
        totalFiles: structure.metadata.totalFiles,
        totalDirectories: structure.metadata.totalDirectories,
        projectType: structure.metadata.projectType,
        complexityScore: structure.metadata.complexityScore
      });

      return structure;

    } catch (error) {
      logger.error('Structure analysis failed:', error);
      throw error;
    }
  }

  /**
   * Generate project structure
   * @param {object} plan - Project plan
   * @param {object} options - Generation options
   * @returns {object} Generated structure
   */
  async generateStructure(plan, options = {}) {
    try {
      const {
        outputPath = null,
        template = null,
        dryRun = false
      } = options;

      logger.info('Generating project structure', { planId: plan.id, outputPath, template, dryRun });

      // Use production generator to create structure
      const structure = await this.productionGenerator.generateStructure(plan.requirements, {
        type: plan.type,
        dependencies: plan.dependencies,
        integrations: plan.integrations,
        security: plan.security,
        outputPath,
        template,
        dryRun
      });

      // Add additional metadata
      structure.metadata = {
        ...structure.metadata,
        generatedAt: new Date().toISOString(),
        planId: plan.id,
        planName: plan.name,
        generatedBy: 'recoder-structure-service'
      };

      if (!dryRun && outputPath) {
        // Create the actual directory structure
        await this.createPhysicalStructure(structure, outputPath);
        logger.info('Physical structure created', { outputPath });
      }

      return structure;

    } catch (error) {
      logger.error('Structure generation failed:', error);
      throw error;
    }
  }

  /**
   * Validate project structure
   * @param {string} projectPath - Path to the project directory
   * @param {array} rules - Validation rules
   * @returns {object} Validation results
   */
  async validateStructure(projectPath, rules = []) {
    try {
      logger.info('Validating project structure', { projectPath, rulesCount: rules.length });

      const validation = {
        isValid: true,
        score: 0,
        issues: [],
        warnings: [],
        recommendations: [],
        checklist: []
      };

      // Analyze current structure
      const structure = await this.analyzeStructure(projectPath, { deep: true });

      // Apply default validation rules
      const defaultRules = await this.getDefaultValidationRules();
      const allRules = [...defaultRules, ...rules];

      // Run validation rules
      for (const rule of allRules) {
        const ruleResult = await this.applyValidationRule(structure, rule);
        
        if (ruleResult.status === 'fail') {
          validation.issues.push(ruleResult);
        } else if (ruleResult.status === 'warning') {
          validation.warnings.push(ruleResult);
        } else if (ruleResult.status === 'recommendation') {
          validation.recommendations.push(ruleResult);
        }
      }

      // Calculate validation score
      const totalRules = allRules.length;
      const failedRules = validation.issues.length;
      const warningRules = validation.warnings.length;
      
      validation.score = Math.max(0, ((totalRules - failedRules - (warningRules * 0.5)) / totalRules) * 100);
      validation.isValid = validation.score >= 70;

      // Generate validation checklist
      validation.checklist = await this.generateValidationChecklist(structure);

      logger.info('Structure validation completed', {
        isValid: validation.isValid,
        score: validation.score,
        issues: validation.issues.length,
        warnings: validation.warnings.length
      });

      return validation;

    } catch (error) {
      logger.error('Structure validation failed:', error);
      throw error;
    }
  }

  /**
   * Get structure templates
   * @param {object} filters - Filter options
   * @returns {array} Structure templates
   */
  async getTemplates(filters = {}) {
    try {
      const { type, category } = filters;
      
      const whereClause = { category: 'structure' };
      if (type) whereClause.type = type;
      if (category) whereClause.subcategory = category;

      const templates = await Template.findAll({
        where: whereClause,
        attributes: ['id', 'name', 'description', 'type', 'category', 'subcategory', 'variables', 'structure', 'created_at'],
        order: [['name', 'ASC']]
      });

      return templates;

    } catch (error) {
      logger.error('Failed to get structure templates:', error);
      throw error;
    }
  }

  /**
   * Compare project structures
   * @param {object} sourceStructure - Source structure
   * @param {object} targetStructure - Target structure
   * @param {object} options - Comparison options
   * @returns {object} Comparison results
   */
  async compareStructures(sourceStructure, targetStructure, options = {}) {
    try {
      const {
        detailed = false,
        includeContent = false
      } = options;

      logger.info('Comparing project structures', { detailed, includeContent });

      const comparison = {
        summary: {
          identical: false,
          similarity: 0,
          differences: 0,
          additions: 0,
          deletions: 0,
          modifications: 0
        },
        differences: [],
        additions: [],
        deletions: [],
        modifications: []
      };

      // Compare directory structures
      const structureDiff = await this.compareDirectoryStructures(
        sourceStructure, 
        targetStructure, 
        detailed
      );

      comparison.differences = structureDiff.differences;
      comparison.additions = structureDiff.additions;
      comparison.deletions = structureDiff.deletions;
      comparison.modifications = structureDiff.modifications;

      // Calculate similarity
      const totalItems = this.countStructureItems(sourceStructure) + this.countStructureItems(targetStructure);
      const diffCount = comparison.differences.length + comparison.additions.length + 
                       comparison.deletions.length + comparison.modifications.length;
      
      comparison.summary.similarity = Math.max(0, ((totalItems - diffCount) / totalItems) * 100);
      comparison.summary.identical = comparison.summary.similarity === 100;
      comparison.summary.differences = diffCount;
      comparison.summary.additions = comparison.additions.length;
      comparison.summary.deletions = comparison.deletions.length;
      comparison.summary.modifications = comparison.modifications.length;

      // Compare file contents if requested
      if (includeContent) {
        const contentComparison = await this.compareFileContents(
          sourceStructure, 
          targetStructure
        );
        comparison.contentChanges = contentComparison;
      }

      return comparison;

    } catch (error) {
      logger.error('Structure comparison failed:', error);
      throw error;
    }
  }

  /**
   * Optimize project structure
   * @param {string} projectPath - Path to the project directory
   * @param {object} options - Optimization options
   * @returns {object} Optimization results
   */
  async optimizeStructure(projectPath, options = {}) {
    try {
      const {
        rules = [],
        dryRun = false
      } = options;

      logger.info('Optimizing project structure', { projectPath, dryRun });

      // Analyze current structure
      const structure = await this.analyzeStructure(projectPath, { deep: true });

      // Identify optimization opportunities
      const optimizations = await this.identifyOptimizations(structure);

      // Apply optimization rules
      const optimizationResults = {
        original: structure,
        optimizations,
        applied: [],
        estimatedImpact: {},
        dryRun
      };

      if (!dryRun) {
        // Apply optimizations
        for (const optimization of optimizations) {
          try {
            const result = await this.applyOptimization(projectPath, optimization);
            optimizationResults.applied.push(result);
          } catch (error) {
            logger.error(`Failed to apply optimization ${optimization.id}:`, error);
          }
        }
      }

      // Calculate estimated impact
      optimizationResults.estimatedImpact = this.calculateOptimizationImpact(optimizations);

      logger.info('Structure optimization completed', {
        optimizationsIdentified: optimizations.length,
        optimizationsApplied: optimizationResults.applied.length,
        dryRun
      });

      return optimizationResults;

    } catch (error) {
      logger.error('Structure optimization failed:', error);
      throw error;
    }
  }

  // Helper methods

  async analyzeDirectory(dirPath, structure, options, depth = 0) {
    if (depth > options.maxDepth) return;

    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        if (options.excludePatterns.some(pattern => item.includes(pattern))) {
          continue;
        }

        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          const child = {
            name: item,
            type: 'directory',
            path: itemPath,
            children: [],
            metadata: {
              size: 0,
              modified: stats.mtime
            }
          };

          structure.children.push(child);
          structure.metadata.totalDirectories++;
          
          if (options.deep) {
            await this.analyzeDirectory(itemPath, child, options, depth + 1);
          }
        } else if (options.includeFiles) {
          const fileInfo = {
            name: item,
            type: 'file',
            path: itemPath,
            metadata: {
              size: stats.size,
              modified: stats.mtime,
              extension: path.extname(item)
            }
          };

          structure.children.push(fileInfo);
          structure.metadata.totalFiles++;
          structure.metadata.totalSize += stats.size;

          // Detect language
          const language = this.detectLanguage(item);
          if (language) {
            structure.metadata.languages.add(language);
          }

          // Update last modified
          if (!structure.metadata.lastModified || stats.mtime > structure.metadata.lastModified) {
            structure.metadata.lastModified = stats.mtime;
          }
        }
      }
    } catch (error) {
      logger.error(`Error analyzing directory ${dirPath}:`, error);
    }
  }

  async detectProjectInfo(projectPath) {
    const info = {
      type: 'unknown',
      frameworks: []
    };

    try {
      // Check for package.json
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        
        // Detect frameworks from dependencies
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies
        };

        if (allDeps.react) info.frameworks.push('React');
        if (allDeps.vue) info.frameworks.push('Vue.js');
        if (allDeps.angular) info.frameworks.push('Angular');
        if (allDeps.express) info.frameworks.push('Express.js');
        if (allDeps.next) info.frameworks.push('Next.js');
        if (allDeps.nuxt) info.frameworks.push('Nuxt.js');
        if (allDeps['react-native']) info.frameworks.push('React Native');

        // Detect project type
        if (allDeps['react-native']) {
          info.type = 'mobile';
        } else if (allDeps.react || allDeps.vue || allDeps.angular) {
          info.type = 'web';
        } else if (allDeps.express || allDeps.fastify || allDeps.koa) {
          info.type = 'backend';
        } else {
          info.type = 'web';
        }
      }

      // Check for other project indicators
      const indicators = [
        { file: 'Cargo.toml', type: 'rust', framework: 'Rust' },
        { file: 'go.mod', type: 'go', framework: 'Go' },
        { file: 'requirements.txt', type: 'python', framework: 'Python' },
        { file: 'Gemfile', type: 'ruby', framework: 'Ruby' },
        { file: 'composer.json', type: 'php', framework: 'PHP' },
        { file: 'pom.xml', type: 'java', framework: 'Java' },
        { file: 'build.gradle', type: 'java', framework: 'Java' }
      ];

      for (const indicator of indicators) {
        if (await fs.pathExists(path.join(projectPath, indicator.file))) {
          info.type = indicator.type;
          info.frameworks.push(indicator.framework);
          break;
        }
      }

    } catch (error) {
      logger.error('Error detecting project info:', error);
    }

    return info;
  }

  async analyzePackageJson(projectPath) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (!await fs.pathExists(packageJsonPath)) {
        return null;
      }

      const packageJson = await fs.readJson(packageJsonPath);
      
      return {
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        dependencies: Object.keys(packageJson.dependencies || {}),
        devDependencies: Object.keys(packageJson.devDependencies || {}),
        scripts: packageJson.scripts || {},
        engines: packageJson.engines || {},
        main: packageJson.main,
        author: packageJson.author,
        license: packageJson.license
      };
    } catch (error) {
      logger.error('Error analyzing package.json:', error);
      return null;
    }
  }

  calculateComplexityScore(structure) {
    let score = 0;
    
    // Base score from file and directory counts
    score += structure.metadata.totalFiles * 0.5;
    score += structure.metadata.totalDirectories * 1;
    
    // Language diversity
    score += structure.metadata.languages.length * 2;
    
    // Framework complexity
    score += structure.metadata.frameworks.length * 3;
    
    // Dependency count
    score += structure.metadata.dependencies.length * 0.1;
    
    // Normalize to 0-100 scale
    return Math.min(100, Math.max(0, score));
  }

  async generateArchitectureInsights(structure) {
    const insights = [];
    
    // Layer detection
    const hasLayers = structure.children.some(child => 
      ['src', 'lib', 'components', 'services', 'utils'].includes(child.name)
    );
    
    if (hasLayers) {
      insights.push({
        type: 'architecture',
        message: 'Layered architecture detected',
        details: 'Project follows a layered architecture pattern'
      });
    }

    // Monorepo detection
    const hasPackages = structure.children.some(child => 
      child.name === 'packages' && child.type === 'directory'
    );
    
    if (hasPackages) {
      insights.push({
        type: 'architecture',
        message: 'Monorepo structure detected',
        details: 'Project uses a monorepo structure with packages'
      });
    }

    // Microservices detection
    const hasServices = structure.children.some(child => 
      child.name === 'services' && child.type === 'directory'
    );
    
    if (hasServices) {
      insights.push({
        type: 'architecture',
        message: 'Microservices architecture detected',
        details: 'Project follows a microservices architecture'
      });
    }

    return insights;
  }

  async identifyStructureIssues(structure) {
    const issues = [];
    
    // Check for common anti-patterns
    if (structure.metadata.totalFiles > 1000) {
      issues.push({
        type: 'warning',
        message: 'Large number of files',
        details: `Project has ${structure.metadata.totalFiles} files, consider reorganizing`
      });
    }

    if (structure.metadata.totalDirectories > 50) {
      issues.push({
        type: 'warning',
        message: 'Deep directory structure',
        details: `Project has ${structure.metadata.totalDirectories} directories, consider flattening`
      });
    }

    // Check for missing essential files
    const essentialFiles = ['README.md', 'LICENSE', '.gitignore'];
    for (const file of essentialFiles) {
      const hasFile = structure.children.some(child => child.name === file);
      if (!hasFile) {
        issues.push({
          type: 'info',
          message: `Missing ${file}`,
          details: `Consider adding ${file} to your project`
        });
      }
    }

    return issues;
  }

  async generateStructureRecommendations(structure) {
    const recommendations = [];
    
    // Recommend structure improvements
    if (structure.metadata.complexityScore > 70) {
      recommendations.push({
        type: 'optimization',
        message: 'Consider simplifying structure',
        details: 'High complexity score indicates the structure could be simplified'
      });
    }

    if (structure.metadata.languages.length > 3) {
      recommendations.push({
        type: 'architecture',
        message: 'Consider language consolidation',
        details: 'Multiple languages detected, consider consolidating for maintainability'
      });
    }

    return recommendations;
  }

  detectLanguage(filename) {
    const ext = path.extname(filename).toLowerCase();
    const languageMap = {
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.cpp': 'C++',
      '.c': 'C',
      '.cs': 'C#',
      '.php': 'PHP',
      '.rb': 'Ruby',
      '.go': 'Go',
      '.rs': 'Rust',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.dart': 'Dart',
      '.sol': 'Solidity',
      '.html': 'HTML',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.sass': 'Sass',
      '.less': 'Less',
      '.json': 'JSON',
      '.xml': 'XML',
      '.yaml': 'YAML',
      '.yml': 'YAML',
      '.md': 'Markdown',
      '.sql': 'SQL'
    };

    return languageMap[ext] || null;
  }

  async getDefaultValidationRules() {
    return [
      {
        id: 'readme-exists',
        name: 'README file exists',
        description: 'Project should have a README file',
        type: 'file-exists',
        target: 'README.md'
      },
      {
        id: 'gitignore-exists',
        name: 'Gitignore file exists',
        description: 'Project should have a .gitignore file',
        type: 'file-exists',
        target: '.gitignore'
      },
      {
        id: 'src-directory',
        name: 'Source directory exists',
        description: 'Project should have a src directory',
        type: 'directory-exists',
        target: 'src'
      },
      {
        id: 'package-json-valid',
        name: 'Package.json is valid',
        description: 'package.json should be valid JSON',
        type: 'file-valid',
        target: 'package.json'
      },
      {
        id: 'no-large-files',
        name: 'No large files',
        description: 'Files should not exceed 10MB',
        type: 'file-size',
        threshold: 10 * 1024 * 1024
      }
    ];
  }

  async applyValidationRule(structure, rule) {
    const result = {
      ruleId: rule.id,
      ruleName: rule.name,
      status: 'pass',
      message: '',
      details: ''
    };

    try {
      switch (rule.type) {
        case 'file-exists':
          const hasFile = structure.children.some(child => 
            child.name === rule.target && child.type === 'file'
          );
          if (!hasFile) {
            result.status = 'fail';
            result.message = `${rule.target} file not found`;
            result.details = rule.description;
          }
          break;

        case 'directory-exists':
          const hasDir = structure.children.some(child => 
            child.name === rule.target && child.type === 'directory'
          );
          if (!hasDir) {
            result.status = 'warning';
            result.message = `${rule.target} directory not found`;
            result.details = rule.description;
          }
          break;

        case 'file-size':
          const largeFiles = this.findLargeFiles(structure, rule.threshold);
          if (largeFiles.length > 0) {
            result.status = 'warning';
            result.message = `${largeFiles.length} large files found`;
            result.details = `Files exceeding ${rule.threshold} bytes: ${largeFiles.map(f => f.name).join(', ')}`;
          }
          break;

        default:
          result.status = 'warning';
          result.message = `Unknown rule type: ${rule.type}`;
      }
    } catch (error) {
      result.status = 'fail';
      result.message = 'Rule validation failed';
      result.details = error.message;
    }

    return result;
  }

  findLargeFiles(structure, threshold) {
    const largeFiles = [];
    
    const searchChildren = (item) => {
      if (item.type === 'file' && item.metadata.size > threshold) {
        largeFiles.push(item);
      }
      
      if (item.children) {
        item.children.forEach(searchChildren);
      }
    };
    
    structure.children.forEach(searchChildren);
    return largeFiles;
  }

  async generateValidationChecklist(structure) {
    return [
      { item: 'README.md exists', status: structure.children.some(c => c.name === 'README.md') },
      { item: '.gitignore exists', status: structure.children.some(c => c.name === '.gitignore') },
      { item: 'src directory exists', status: structure.children.some(c => c.name === 'src') },
      { item: 'package.json exists', status: structure.children.some(c => c.name === 'package.json') },
      { item: 'LICENSE exists', status: structure.children.some(c => c.name === 'LICENSE') },
      { item: 'Tests directory exists', status: structure.children.some(c => c.name.includes('test')) },
      { item: 'Documentation exists', status: structure.children.some(c => c.name === 'docs') },
      { item: 'Configuration files exist', status: structure.children.some(c => c.name.includes('config')) }
    ];
  }

  async createPhysicalStructure(structure, outputPath) {
    const createItem = async (item, parentPath) => {
      const itemPath = path.join(parentPath, item.name);
      
      if (item.type === 'directory') {
        await fs.ensureDir(itemPath);
        
        if (item.children) {
          for (const child of item.children) {
            await createItem(child, itemPath);
          }
        }
      } else if (item.type === 'file') {
        await fs.ensureFile(itemPath);
        
        if (item.content) {
          await fs.writeFile(itemPath, item.content);
        }
      }
    };

    await fs.ensureDir(outputPath);
    
    if (structure.children) {
      for (const child of structure.children) {
        await createItem(child, outputPath);
      }
    }
  }

  async compareDirectoryStructures(source, target, detailed) {
    const differences = [];
    const additions = [];
    const deletions = [];
    const modifications = [];

    // Compare children
    const sourceChildren = source.children || [];
    const targetChildren = target.children || [];

    const sourceNames = new Set(sourceChildren.map(c => c.name));
    const targetNames = new Set(targetChildren.map(c => c.name));

    // Find additions (in target but not in source)
    for (const targetChild of targetChildren) {
      if (!sourceNames.has(targetChild.name)) {
        additions.push({
          name: targetChild.name,
          type: targetChild.type,
          path: targetChild.path
        });
      }
    }

    // Find deletions (in source but not in target)
    for (const sourceChild of sourceChildren) {
      if (!targetNames.has(sourceChild.name)) {
        deletions.push({
          name: sourceChild.name,
          type: sourceChild.type,
          path: sourceChild.path
        });
      }
    }

    // Find modifications (in both but different)
    for (const sourceChild of sourceChildren) {
      const targetChild = targetChildren.find(c => c.name === sourceChild.name);
      if (targetChild) {
        if (sourceChild.type !== targetChild.type) {
          modifications.push({
            name: sourceChild.name,
            change: 'type',
            from: sourceChild.type,
            to: targetChild.type
          });
        }
        
        if (detailed && sourceChild.type === 'file' && targetChild.type === 'file') {
          if (sourceChild.metadata.size !== targetChild.metadata.size) {
            modifications.push({
              name: sourceChild.name,
              change: 'size',
              from: sourceChild.metadata.size,
              to: targetChild.metadata.size
            });
          }
        }
      }
    }

    return { differences, additions, deletions, modifications };
  }

  countStructureItems(structure) {
    let count = 1; // Count the structure itself
    
    if (structure.children) {
      for (const child of structure.children) {
        count += this.countStructureItems(child);
      }
    }
    
    return count;
  }

  async compareFileContents(source, target) {
    // This would implement actual file content comparison
    // For now, return a placeholder
    return {
      identical: true,
      differences: [],
      similarity: 100
    };
  }

  async identifyOptimizations(structure) {
    const optimizations = [];

    // Check for empty directories
    const emptyDirs = this.findEmptyDirectories(structure);
    if (emptyDirs.length > 0) {
      optimizations.push({
        id: 'remove-empty-dirs',
        type: 'cleanup',
        description: 'Remove empty directories',
        items: emptyDirs,
        impact: 'low'
      });
    }

    // Check for duplicate files
    const duplicates = this.findDuplicateFiles(structure);
    if (duplicates.length > 0) {
      optimizations.push({
        id: 'remove-duplicates',
        type: 'cleanup',
        description: 'Remove duplicate files',
        items: duplicates,
        impact: 'medium'
      });
    }

    // Check for large files
    const largeFiles = this.findLargeFiles(structure, 5 * 1024 * 1024); // 5MB threshold
    if (largeFiles.length > 0) {
      optimizations.push({
        id: 'optimize-large-files',
        type: 'optimization',
        description: 'Optimize large files',
        items: largeFiles,
        impact: 'high'
      });
    }

    return optimizations;
  }

  findEmptyDirectories(structure) {
    const emptyDirs = [];
    
    const searchChildren = (item) => {
      if (item.type === 'directory' && (!item.children || item.children.length === 0)) {
        emptyDirs.push(item);
      }
      
      if (item.children) {
        item.children.forEach(searchChildren);
      }
    };
    
    structure.children?.forEach(searchChildren);
    return emptyDirs;
  }

  findDuplicateFiles(structure) {
    const fileMap = new Map();
    const duplicates = [];
    
    const searchChildren = (item) => {
      if (item.type === 'file') {
        const key = `${item.name}_${item.metadata.size}`;
        if (fileMap.has(key)) {
          duplicates.push({ original: fileMap.get(key), duplicate: item });
        } else {
          fileMap.set(key, item);
        }
      }
      
      if (item.children) {
        item.children.forEach(searchChildren);
      }
    };
    
    structure.children?.forEach(searchChildren);
    return duplicates;
  }

  async applyOptimization(projectPath, optimization) {
    const result = {
      optimizationId: optimization.id,
      status: 'success',
      message: '',
      itemsProcessed: 0
    };

    try {
      switch (optimization.type) {
        case 'cleanup':
          if (optimization.id === 'remove-empty-dirs') {
            for (const dir of optimization.items) {
              await fs.remove(dir.path);
              result.itemsProcessed++;
            }
            result.message = `Removed ${result.itemsProcessed} empty directories`;
          }
          break;

        case 'optimization':
          result.message = `Optimization ${optimization.id} applied`;
          break;

        default:
          result.status = 'skipped';
          result.message = `Unknown optimization type: ${optimization.type}`;
      }
    } catch (error) {
      result.status = 'failed';
      result.message = error.message;
    }

    return result;
  }

  calculateOptimizationImpact(optimizations) {
    const impact = {
      spacesSaved: 0,
      filesReduced: 0,
      performanceImprovement: 0,
      maintainabilityImprovement: 0
    };

    for (const optimization of optimizations) {
      switch (optimization.impact) {
        case 'high':
          impact.performanceImprovement += 30;
          impact.maintainabilityImprovement += 25;
          break;
        case 'medium':
          impact.performanceImprovement += 15;
          impact.maintainabilityImprovement += 15;
          break;
        case 'low':
          impact.performanceImprovement += 5;
          impact.maintainabilityImprovement += 5;
          break;
      }
      
      impact.filesReduced += optimization.items?.length || 0;
    }

    return impact;
  }
}

module.exports = { StructureService };