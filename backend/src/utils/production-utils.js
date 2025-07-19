const { spawn } = require('child_process');
const path = require('path');
const { logger } = require('./logger');
const { FileUtils } = require('./file-utils');

class ProductionUtils {
  static async buildProject(projectPath, buildOptions = {}) {
    try {
      const {
        framework = 'auto',
        environment = 'production',
        outputDir = 'dist',
        minify = true,
        sourcemap = false
      } = buildOptions;

      logger.info('Starting project build', { projectPath, framework, environment });

      const detectedFramework = framework === 'auto' 
        ? await this.detectBuildTool(projectPath)
        : framework;

      const buildCommand = await this.getBuildCommand(detectedFramework, {
        environment,
        outputDir,
        minify,
        sourcemap
      });

      const result = await this.executeCommand(
        buildCommand.command, 
        buildCommand.args, 
        projectPath
      );

      if (result.exitCode !== 0) {
        throw new Error(`Build failed: ${result.stderr}`);
      }

      const buildInfo = await this.analyzeBuild(projectPath, outputDir);

      logger.info('Project build completed successfully', buildInfo);

      return {
        success: true,
        framework: detectedFramework,
        buildTime: buildInfo.buildTime,
        outputSize: buildInfo.totalSize,
        files: buildInfo.files,
        output: result.stdout
      };
    } catch (error) {
      logger.error('Project build failed:', { error: error.message });
      throw error;
    }
  }

  static async detectBuildTool(projectPath) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = await FileUtils.readJSONFile(packageJsonPath);
      
      if (!packageJson) {
        return 'generic';
      }

      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      const scripts = packageJson.scripts || {};

      // Check for specific build tools
      if (dependencies.vite || scripts.build?.includes('vite')) {
        return 'vite';
      } else if (dependencies.webpack || scripts.build?.includes('webpack')) {
        return 'webpack';
      } else if (dependencies.parcel || scripts.build?.includes('parcel')) {
        return 'parcel';
      } else if (dependencies['@vercel/ncc']) {
        return 'ncc';
      } else if (dependencies.rollup) {
        return 'rollup';
      } else if (dependencies.esbuild) {
        return 'esbuild';
      } else if (dependencies.next) {
        return 'next';
      } else if (dependencies.nuxt) {
        return 'nuxt';
      } else if (dependencies['@angular/cli']) {
        return 'angular';
      } else if (dependencies.react && dependencies['react-scripts']) {
        return 'create-react-app';
      }

      return 'generic';
    } catch (error) {
      logger.error('Failed to detect build tool:', { error: error.message });
      return 'generic';
    }
  }

  static async getBuildCommand(framework, options) {
    const { environment, outputDir, minify, sourcemap } = options;

    const commands = {
      vite: {
        command: 'npm',
        args: ['run', 'build']
      },
      webpack: {
        command: 'npm',
        args: ['run', 'build']
      },
      parcel: {
        command: 'npm',
        args: ['run', 'build']
      },
      next: {
        command: 'npm',
        args: ['run', 'build']
      },
      nuxt: {
        command: 'npm',
        args: ['run', 'build']
      },
      angular: {
        command: 'npm',
        args: ['run', 'build', '--prod']
      },
      'create-react-app': {
        command: 'npm',
        args: ['run', 'build']
      },
      rollup: {
        command: 'npx',
        args: ['rollup', '-c']
      },
      esbuild: {
        command: 'npx',
        args: ['esbuild', 'src/index.js', '--bundle', '--outdir=dist']
      },
      generic: {
        command: 'npm',
        args: ['run', 'build']
      }
    };

    return commands[framework] || commands.generic;
  }

  static async optimizeAssets(projectPath, outputDir) {
    try {
      logger.info('Starting asset optimization', { projectPath, outputDir });

      const buildPath = path.join(projectPath, outputDir);
      const files = await FileUtils.listFiles(buildPath, { recursive: true });

      const optimizations = [];

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        
        switch (ext) {
          case '.js':
            await this.optimizeJavaScript(file);
            optimizations.push({ file, type: 'javascript' });
            break;
          case '.css':
            await this.optimizeCSS(file);
            optimizations.push({ file, type: 'css' });
            break;
          case '.html':
            await this.optimizeHTML(file);
            optimizations.push({ file, type: 'html' });
            break;
          case '.png':
          case '.jpg':
          case '.jpeg':
          case '.gif':
          case '.webp':
            await this.optimizeImage(file);
            optimizations.push({ file, type: 'image' });
            break;
        }
      }

      logger.info('Asset optimization completed', { 
        optimizedFiles: optimizations.length 
      });

      return optimizations;
    } catch (error) {
      logger.error('Asset optimization failed:', { error: error.message });
      throw error;
    }
  }

  static async optimizeJavaScript(filePath) {
    try {
      // This would use tools like terser or esbuild for minification
      // For now, we'll just log the optimization
      logger.debug('Optimizing JavaScript file:', { filePath });
    } catch (error) {
      logger.error('JavaScript optimization failed:', { filePath, error: error.message });
    }
  }

  static async optimizeCSS(filePath) {
    try {
      // This would use tools like cssnano for minification
      logger.debug('Optimizing CSS file:', { filePath });
    } catch (error) {
      logger.error('CSS optimization failed:', { filePath, error: error.message });
    }
  }

  static async optimizeHTML(filePath) {
    try {
      // This would use tools like html-minifier
      logger.debug('Optimizing HTML file:', { filePath });
    } catch (error) {
      logger.error('HTML optimization failed:', { filePath, error: error.message });
    }
  }

  static async optimizeImage(filePath) {
    try {
      // This would use tools like imagemin
      logger.debug('Optimizing image file:', { filePath });
    } catch (error) {
      logger.error('Image optimization failed:', { filePath, error: error.message });
    }
  }

  static async analyzeBuild(projectPath, outputDir) {
    try {
      const buildPath = path.join(projectPath, outputDir);
      const files = await FileUtils.listFiles(buildPath, { recursive: true });

      let totalSize = 0;
      const fileAnalysis = [];

      for (const file of files) {
        const stats = await FileUtils.getFileStats(file);
        totalSize += stats.size;
        
        fileAnalysis.push({
          path: path.relative(buildPath, file),
          size: stats.size,
          type: path.extname(file),
          compressed: this.isCompressed(file)
        });
      }

      // Sort files by size (largest first)
      fileAnalysis.sort((a, b) => b.size - a.size);

      return {
        totalSize,
        totalFiles: files.length,
        files: fileAnalysis,
        buildTime: Date.now(), // This would be calculated from build start
        sizeByType: this.groupFilesByType(fileAnalysis)
      };
    } catch (error) {
      logger.error('Build analysis failed:', { error: error.message });
      throw error;
    }
  }

  static isCompressed(filePath) {
    const compressedExtensions = ['.gz', '.br', '.zip'];
    return compressedExtensions.some(ext => filePath.endsWith(ext));
  }

  static groupFilesByType(files) {
    const groups = {};
    
    for (const file of files) {
      const type = file.type || 'other';
      if (!groups[type]) {
        groups[type] = { count: 0, totalSize: 0 };
      }
      groups[type].count++;
      groups[type].totalSize += file.size;
    }
    
    return groups;
  }

  static async generateBuildReport(buildResult) {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        framework: buildResult.framework,
        success: buildResult.success,
        buildTime: buildResult.buildTime,
        totalSize: buildResult.outputSize,
        files: buildResult.files.slice(0, 10), // Top 10 largest files
        sizeByType: buildResult.sizeByType,
        recommendations: this.generateOptimizationRecommendations(buildResult)
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate build report:', { error: error.message });
      throw error;
    }
  }

  static generateOptimizationRecommendations(buildResult) {
    const recommendations = [];

    // Check for large JavaScript files
    const largeJSFiles = buildResult.files.filter(f => 
      f.type === '.js' && f.size > 500 * 1024 // > 500KB
    );

    if (largeJSFiles.length > 0) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'Consider code splitting for large JavaScript bundles',
        files: largeJSFiles.map(f => f.path)
      });
    }

    // Check for uncompressed assets
    const uncompressedFiles = buildResult.files.filter(f => 
      !f.compressed && f.size > 100 * 1024 // > 100KB
    );

    if (uncompressedFiles.length > 0) {
      recommendations.push({
        type: 'compression',
        priority: 'medium',
        message: 'Enable gzip/brotli compression for large assets',
        files: uncompressedFiles.map(f => f.path)
      });
    }

    // Check for many small files
    const smallFiles = buildResult.files.filter(f => f.size < 1024); // < 1KB

    if (smallFiles.length > 20) {
      recommendations.push({
        type: 'bundling',
        priority: 'medium',
        message: 'Consider bundling small files to reduce HTTP requests',
        count: smallFiles.length
      });
    }

    return recommendations;
  }

  static async deploymentPrecheck(projectPath, outputDir) {
    try {
      const checks = [];

      // Check if build directory exists
      const buildPath = path.join(projectPath, outputDir);
      const buildExists = await FileUtils.fileExists(buildPath);
      
      checks.push({
        name: 'Build directory exists',
        passed: buildExists,
        message: buildExists ? 'Build directory found' : 'Build directory not found'
      });

      if (buildExists) {
        // Check for essential files
        const indexFile = await FileUtils.fileExists(path.join(buildPath, 'index.html'));
        checks.push({
          name: 'Index file exists',
          passed: indexFile,
          message: indexFile ? 'index.html found' : 'index.html not found'
        });

        // Check for package.json in production builds
        const packageJson = await FileUtils.fileExists(path.join(projectPath, 'package.json'));
        if (packageJson) {
          const pkg = await FileUtils.readJSONFile(path.join(projectPath, 'package.json'));
          const hasStartScript = pkg.scripts && pkg.scripts.start;
          
          checks.push({
            name: 'Start script defined',
            passed: hasStartScript,
            message: hasStartScript ? 'Start script found' : 'No start script defined'
          });
        }

        // Check for environment variables template
        const envExample = await FileUtils.fileExists(path.join(projectPath, '.env.example'));
        checks.push({
          name: 'Environment template',
          passed: envExample,
          message: envExample ? '.env.example found' : 'No .env.example file'
        });
      }

      const allPassed = checks.every(check => check.passed);

      return {
        ready: allPassed,
        checks,
        warnings: checks.filter(check => !check.passed)
      };
    } catch (error) {
      logger.error('Deployment precheck failed:', { error: error.message });
      throw error;
    }
  }

  static async executeCommand(command, args, cwd, timeout = 300000) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        stdio: 'pipe',
        shell: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        resolve({
          exitCode: code,
          stdout,
          stderr
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }
}

module.exports = { ProductionUtils };