const { BaseAnalyzer } = require('./baseAnalyzer');
const { FileUtils } = require('../utils/file-utils');
const { ASTParser } = require('../utils/ast-parser');
const { logger } = require('../utils/logger');
const path = require('path');

class WebAnalyzer extends BaseAnalyzer {
  constructor(options = {}) {
    super(options);
    this.webFrameworks = {
      react: ['react', 'react-dom', 'next', 'gatsby'],
      vue: ['vue', 'nuxt', 'vue-router'],
      angular: ['@angular/core', '@angular/cli'],
      svelte: ['svelte', 'sveltekit'],
      vanilla: []
    };
    
    this.buildTools = {
      webpack: ['webpack', 'webpack-cli'],
      vite: ['vite'],
      parcel: ['parcel'],
      rollup: ['rollup'],
      esbuild: ['esbuild']
    };
  }

  async analyze(input, context = {}) {
    try {
      const { projectPath, packageJson } = input;
      
      const analysis = await this.performAsyncAnalysis(input, async () => {
        const results = {
          framework: await this.detectFramework(packageJson || projectPath),
          buildTool: await this.detectBuildTool(packageJson || projectPath),
          structure: await this.analyzeProjectStructure(projectPath),
          components: await this.analyzeComponents(projectPath),
          routing: await this.analyzeRouting(projectPath),
          styling: await this.analyzeStyling(projectPath),
          performance: await this.analyzePerformance(projectPath),
          seo: await this.analyzeSEO(projectPath),
          accessibility: await this.analyzeAccessibility(projectPath),
          bundleAnalysis: await this.analyzeBundleOptimization(projectPath)
        };

        results.summary = this.generateWebSummary(results);
        results.metrics = this.generateWebMetrics(results);
        results.recommendations = this.generateWebRecommendations(results);
        
        return results;
      });

      return this.createAnalysisResult(analysis, {
        analysisType: 'web',
        projectPath: typeof input === 'string' ? input : input.projectPath
      });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  async detectFramework(packageJsonPath) {
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
        return { framework: 'unknown', version: null, confidence: 0 };
      }

      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      for (const [framework, packages] of Object.entries(this.webFrameworks)) {
        for (const pkg of packages) {
          if (dependencies[pkg]) {
            return {
              framework,
              version: dependencies[pkg],
              package: pkg,
              confidence: this.calculateFrameworkConfidence(framework, dependencies)
            };
          }
        }
      }

      return { framework: 'vanilla', version: null, confidence: 50 };
    } catch (error) {
      logger.error('Framework detection failed:', error);
      return { framework: 'unknown', version: null, confidence: 0 };
    }
  }

  calculateFrameworkConfidence(framework, dependencies) {
    const frameworkPackages = this.webFrameworks[framework] || [];
    const foundPackages = frameworkPackages.filter(pkg => dependencies[pkg]);
    
    return Math.min(100, (foundPackages.length / frameworkPackages.length) * 100 + 20);
  }

  async detectBuildTool(packageJsonPath) {
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
        return { buildTool: 'unknown', version: null };
      }

      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      const scripts = packageJson.scripts || {};

      for (const [tool, packages] of Object.entries(this.buildTools)) {
        for (const pkg of packages) {
          if (dependencies[pkg]) {
            return {
              buildTool: tool,
              version: dependencies[pkg],
              package: pkg,
              scripts: this.extractRelevantScripts(scripts, tool)
            };
          }
        }
      }

      // Check scripts for build tools
      const scriptContent = JSON.stringify(scripts);
      if (scriptContent.includes('webpack')) return { buildTool: 'webpack', version: null };
      if (scriptContent.includes('vite')) return { buildTool: 'vite', version: null };
      if (scriptContent.includes('parcel')) return { buildTool: 'parcel', version: null };

      return { buildTool: 'unknown', version: null };
    } catch (error) {
      logger.error('Build tool detection failed:', error);
      return { buildTool: 'unknown', version: null };
    }
  }

  extractRelevantScripts(scripts, buildTool) {
    const relevant = {};
    
    for (const [scriptName, scriptCommand] of Object.entries(scripts)) {
      if (scriptCommand.includes(buildTool)) {
        relevant[scriptName] = scriptCommand;
      }
    }
    
    return relevant;
  }

  async analyzeProjectStructure(projectPath) {
    try {
      if (!projectPath) return {};

      const structure = {
        hasPublicFolder: await FileUtils.fileExists(path.join(projectPath, 'public')),
        hasSrcFolder: await FileUtils.fileExists(path.join(projectPath, 'src')),
        hasComponentsFolder: false,
        hasPagesFolder: false,
        hasAssetsFolder: false,
        hasStylesFolder: false,
        indexFile: null,
        configFiles: []
      };

      // Check for common folders
      const commonFolders = ['components', 'pages', 'assets', 'styles', 'hooks', 'utils', 'services'];
      for (const folder of commonFolders) {
        const folderPath = path.join(projectPath, 'src', folder);
        const altFolderPath = path.join(projectPath, folder);
        
        if (await FileUtils.fileExists(folderPath) || await FileUtils.fileExists(altFolderPath)) {
          structure[`has${folder.charAt(0).toUpperCase() + folder.slice(1)}Folder`] = true;
        }
      }

      // Find index file
      const indexFiles = ['index.html', 'public/index.html', 'src/index.js', 'src/index.ts', 'src/main.js', 'src/main.ts'];
      for (const indexFile of indexFiles) {
        if (await FileUtils.fileExists(path.join(projectPath, indexFile))) {
          structure.indexFile = indexFile;
          break;
        }
      }

      // Find config files
      const configFiles = [
        'webpack.config.js', 'vite.config.js', 'vue.config.js', 'next.config.js',
        'tailwind.config.js', 'postcss.config.js', '.babelrc', 'tsconfig.json'
      ];
      
      for (const configFile of configFiles) {
        if (await FileUtils.fileExists(path.join(projectPath, configFile))) {
          structure.configFiles.push(configFile);
        }
      }

      structure.score = this.calculateStructureScore(structure);
      
      return structure;
    } catch (error) {
      logger.error('Project structure analysis failed:', error);
      return {};
    }
  }

  calculateStructureScore(structure) {
    let score = 0;
    
    if (structure.hasPublicFolder) score += 10;
    if (structure.hasSrcFolder) score += 15;
    if (structure.hasComponentsFolder) score += 15;
    if (structure.hasPagesFolder) score += 10;
    if (structure.hasAssetsFolder) score += 10;
    if (structure.hasStylesFolder) score += 10;
    if (structure.indexFile) score += 20;
    if (structure.configFiles.length > 0) score += 10;
    
    return Math.min(100, score);
  }

  async analyzeComponents(projectPath) {
    try {
      if (!projectPath) return {};

      const componentAnalysis = {
        totalComponents: 0,
        componentTypes: {},
        complexity: {},
        reusability: {},
        patterns: []
      };

      const componentDirs = [
        path.join(projectPath, 'src', 'components'),
        path.join(projectPath, 'components'),
        path.join(projectPath, 'src')
      ];

      for (const dir of componentDirs) {
        if (await FileUtils.fileExists(dir)) {
          const files = await FileUtils.listFiles(dir, { 
            recursive: true,
            extension: '.jsx'
          });
          
          // Also get .tsx files
          const tsxFiles = await FileUtils.listFiles(dir, { 
            recursive: true,
            extension: '.tsx'
          });
          
          files.push(...tsxFiles);
          
          for (const file of files) {
            const component = await this.analyzeComponent(file);
            if (component) {
              componentAnalysis.totalComponents++;
              componentAnalysis.componentTypes[component.type] = 
                (componentAnalysis.componentTypes[component.type] || 0) + 1;
            }
          }
        }
      }

      componentAnalysis.averageComplexity = this.calculateAverageComplexity(componentAnalysis);
      componentAnalysis.recommendations = this.generateComponentRecommendations(componentAnalysis);

      return componentAnalysis;
    } catch (error) {
      logger.error('Component analysis failed:', error);
      return {};
    }
  }

  async analyzeComponent(filePath) {
    try {
      const content = await FileUtils.readFile(filePath);
      if (!content) return null;

      const component = {
        name: path.basename(filePath, path.extname(filePath)),
        file: filePath,
        type: this.detectComponentType(content),
        complexity: this.calculateComponentComplexity(content),
        hooks: this.extractHooks(content),
        props: this.extractProps(content),
        state: this.hasState(content)
      };

      return component;
    } catch (error) {
      logger.warn(`Failed to analyze component ${filePath}:`, error);
      return null;
    }
  }

  detectComponentType(content) {
    if (content.includes('class') && content.includes('extends')) {
      return 'class';
    } else if (content.includes('function') || content.includes('=>')) {
      return 'functional';
    } else if (content.includes('const') && content.includes('=')) {
      return 'arrow';
    }
    return 'unknown';
  }

  calculateComponentComplexity(content) {
    let complexity = 1; // Base complexity

    // Count conditional rendering
    complexity += (content.match(/\?/g) || []).length;
    complexity += (content.match(/&&/g) || []).length;

    // Count loops
    complexity += (content.match(/\.map\(/g) || []).length;
    complexity += (content.match(/\.filter\(/g) || []).length;

    // Count hooks
    complexity += (content.match(/use\w+\(/g) || []).length;

    // Count event handlers
    complexity += (content.match(/on\w+=/g) || []).length;

    return complexity;
  }

  extractHooks(content) {
    const hookPattern = /use\w+\(/g;
    const matches = content.match(hookPattern) || [];
    return matches.map(match => match.replace('(', ''));
  }

  extractProps(content) {
    // Simple props extraction
    const propsPattern = /\{([^}]+)\}\s*\)/;
    const match = content.match(propsPattern);
    if (match) {
      return match[1].split(',').map(prop => prop.trim());
    }
    return [];
  }

  hasState(content) {
    return content.includes('useState') || content.includes('this.state');
  }

  calculateAverageComplexity(componentAnalysis) {
    if (componentAnalysis.totalComponents === 0) return 0;
    
    // This would be calculated from actual component complexities
    return Math.random() * 10 + 5; // Mock for now
  }

  generateComponentRecommendations(componentAnalysis) {
    const recommendations = [];

    if (componentAnalysis.totalComponents > 50) {
      recommendations.push({
        type: 'organization',
        message: 'Consider organizing components into feature-based folders',
        priority: 'medium'
      });
    }

    if (componentAnalysis.averageComplexity > 15) {
      recommendations.push({
        type: 'complexity',
        message: 'Some components are too complex, consider breaking them down',
        priority: 'high'
      });
    }

    return recommendations;
  }

  async analyzeRouting(projectPath) {
    try {
      const routing = {
        hasRouting: false,
        routingLibrary: null,
        routeCount: 0,
        routeStructure: {},
        nestedRoutes: false,
        dynamicRoutes: false
      };

      // Check for routing libraries and files
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = await FileUtils.readJSONFile(packageJsonPath);
      
      if (packageJson) {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        if (deps['react-router-dom']) routing.routingLibrary = 'react-router';
        else if (deps['vue-router']) routing.routingLibrary = 'vue-router';
        else if (deps['@angular/router']) routing.routingLibrary = 'angular-router';
        else if (deps['next']) routing.routingLibrary = 'next-router';
      }

      // Look for route files
      const routeFiles = await this.findRouteFiles(projectPath);
      routing.routeCount = routeFiles.length;
      routing.hasRouting = routing.routeCount > 0 || routing.routingLibrary !== null;

      return routing;
    } catch (error) {
      logger.error('Routing analysis failed:', error);
      return {};
    }
  }

  async findRouteFiles(projectPath) {
    const routeFiles = [];
    const commonPaths = [
      path.join(projectPath, 'src', 'routes'),
      path.join(projectPath, 'src', 'pages'),
      path.join(projectPath, 'pages'),
      path.join(projectPath, 'src', 'router')
    ];

    for (const routePath of commonPaths) {
      if (await FileUtils.fileExists(routePath)) {
        const files = await FileUtils.listFiles(routePath, { recursive: true });
        routeFiles.push(...files.filter(file => 
          ['.js', '.ts', '.jsx', '.tsx'].includes(path.extname(file))
        ));
      }
    }

    return routeFiles;
  }

  async analyzeStyling(projectPath) {
    try {
      const styling = {
        approaches: [],
        preprocessors: [],
        frameworks: [],
        files: {
          css: 0,
          scss: 0,
          sass: 0,
          less: 0,
          stylus: 0
        }
      };

      // Check package.json for styling dependencies
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = await FileUtils.readJSONFile(packageJsonPath);
      
      if (packageJson) {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        // Preprocessors
        if (deps.sass || deps['node-sass']) styling.preprocessors.push('sass');
        if (deps.less) styling.preprocessors.push('less');
        if (deps.stylus) styling.preprocessors.push('stylus');
        
        // CSS-in-JS
        if (deps['styled-components']) styling.approaches.push('styled-components');
        if (deps.emotion || deps['@emotion/react']) styling.approaches.push('emotion');
        if (deps['@mui/material']) styling.approaches.push('material-ui');
        
        // Frameworks
        if (deps.tailwindcss) styling.frameworks.push('tailwind');
        if (deps.bootstrap) styling.frameworks.push('bootstrap');
        if (deps.bulma) styling.frameworks.push('bulma');
      }

      // Count style files
      const styleExtensions = ['.css', '.scss', '.sass', '.less', '.styl'];
      for (const ext of styleExtensions) {
        const files = await FileUtils.listFiles(projectPath, { 
          recursive: true,
          extension: ext
        });
        const key = ext.substring(1); // Remove the dot
        styling.files[key] = files.length;
      }

      styling.totalStyleFiles = Object.values(styling.files).reduce((sum, count) => sum + count, 0);
      styling.recommendations = this.generateStylingRecommendations(styling);

      return styling;
    } catch (error) {
      logger.error('Styling analysis failed:', error);
      return {};
    }
  }

  generateStylingRecommendations(styling) {
    const recommendations = [];

    if (styling.approaches.length > 2) {
      recommendations.push({
        type: 'consistency',
        message: 'Multiple styling approaches detected, consider standardizing',
        priority: 'medium'
      });
    }

    if (styling.totalStyleFiles > 20 && styling.preprocessors.length === 0) {
      recommendations.push({
        type: 'organization',
        message: 'Consider using a CSS preprocessor for better organization',
        priority: 'low'
      });
    }

    return recommendations;
  }

  async analyzePerformance(projectPath) {
    // Mock performance analysis
    return {
      bundleSize: { estimated: '1.2MB', optimized: false },
      codesplitting: { implemented: false, recommendation: 'Implement route-based code splitting' },
      lazyLoading: { components: 0, images: 0 },
      optimization: {
        minification: false,
        compression: false,
        caching: false
      },
      score: 65,
      recommendations: [
        { type: 'bundle', message: 'Implement code splitting to reduce initial bundle size' },
        { type: 'images', message: 'Add lazy loading for images' }
      ]
    };
  }

  async analyzeSEO(projectPath) {
    // Mock SEO analysis
    return {
      metaTags: { present: false, count: 0 },
      structuredData: { present: false },
      sitemap: { present: false },
      robotsTxt: { present: false },
      openGraph: { present: false },
      score: 30,
      recommendations: [
        { type: 'meta', message: 'Add meta description and title tags' },
        { type: 'structure', message: 'Implement structured data markup' }
      ]
    };
  }

  async analyzeAccessibility(projectPath) {
    // Mock accessibility analysis
    return {
      altTags: { coverage: 20 },
      ariaLabels: { usage: 15 },
      semanticHtml: { score: 60 },
      colorContrast: { issues: 3 },
      keyboardNavigation: { supported: false },
      score: 45,
      recommendations: [
        { type: 'images', message: 'Add alt text to all images' },
        { type: 'navigation', message: 'Ensure keyboard navigation support' }
      ]
    };
  }

  async analyzeBundleOptimization(projectPath) {
    return {
      treeshaking: { enabled: false },
      minification: { enabled: false },
      compression: { enabled: false },
      duplicates: { found: 3 },
      recommendations: [
        'Enable tree shaking in build configuration',
        'Configure minification for production builds',
        'Remove duplicate dependencies'
      ]
    };
  }

  generateWebSummary(analysis) {
    const framework = analysis.framework?.framework || 'unknown';
    const buildTool = analysis.buildTool?.buildTool || 'unknown';
    const componentCount = analysis.components?.totalComponents || 0;

    return {
      overview: `${framework} web application using ${buildTool} with ${componentCount} components`,
      framework: analysis.framework,
      buildTool: analysis.buildTool,
      structure: analysis.structure?.score || 0,
      performance: analysis.performance?.score || 0,
      seo: analysis.seo?.score || 0,
      accessibility: analysis.accessibility?.score || 0
    };
  }

  generateWebMetrics(analysis) {
    return {
      frameworkConfidence: analysis.framework?.confidence || 0,
      structureScore: analysis.structure?.score || 0,
      componentComplexity: analysis.components?.averageComplexity || 0,
      performanceScore: analysis.performance?.score || 0,
      seoScore: analysis.seo?.score || 0,
      accessibilityScore: analysis.accessibility?.score || 0,
      overallScore: this.calculateOverallScore(analysis)
    };
  }

  calculateOverallScore(analysis) {
    const scores = [
      analysis.structure?.score || 0,
      analysis.performance?.score || 0,
      analysis.seo?.score || 0,
      analysis.accessibility?.score || 0
    ];

    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }

  generateWebRecommendations(analysis) {
    const recommendations = [];

    // Collect recommendations from all analyses
    if (analysis.components?.recommendations) {
      recommendations.push(...analysis.components.recommendations);
    }
    if (analysis.styling?.recommendations) {
      recommendations.push(...analysis.styling.recommendations);
    }
    if (analysis.performance?.recommendations) {
      recommendations.push(...analysis.performance.recommendations);
    }
    if (analysis.seo?.recommendations) {
      recommendations.push(...analysis.seo.recommendations);
    }
    if (analysis.accessibility?.recommendations) {
      recommendations.push(...analysis.accessibility.recommendations);
    }

    // Sort by priority
    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
    });
  }
}

module.exports = { WebAnalyzer };