/**
 * Project Type Detector
 * Automatically detects project framework and recommends deployment platform
 */

import type { ProjectDetection, ProjectFramework, DeploymentPlatform, FileTree } from './types';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('DeployDetector');

export class ProjectDetector {
  /**
   * Detect project type from files
   */
  async detect(files: Record<string, any>): Promise<ProjectDetection> {
    logger.info('🔍 Detecting project type...');

    // Check for Next.js
    if (this.isNextJs(files)) {
      return this.createDetection('nextjs', 'Next.js', 'vercel', ['netlify', 'railway'], 0.95);
    }

    // Check for React with Vite
    if (this.isReactVite(files)) {
      return this.createDetection('react', 'React (Vite)', 'vercel', ['netlify', 'cloudflare-pages'], 0.9);
    }

    // Check for React with CRA
    if (this.isReactCRA(files)) {
      return this.createDetection('react', 'React (CRA)', 'vercel', ['netlify', 'render'], 0.85);
    }

    // Check for Vue
    if (this.isVue(files)) {
      return this.createDetection('vue', 'Vue.js', 'vercel', ['netlify', 'cloudflare-pages'], 0.9);
    }

    // Check for Svelte
    if (this.isSvelte(files)) {
      return this.createDetection('svelte', 'Svelte', 'vercel', ['netlify', 'cloudflare-pages'], 0.9);
    }

    // Check for Angular
    if (this.isAngular(files)) {
      return this.createDetection('angular', 'Angular', 'vercel', ['netlify', 'render'], 0.85);
    }

    // Check for Node.js/Express
    if (this.isNodeExpress(files)) {
      return this.createDetection('express', 'Express.js', 'railway', ['render', 'fly.io'], 0.8);
    }

    // Check for generic Node.js
    if (this.isNode(files)) {
      return this.createDetection('node', 'Node.js', 'railway', ['render', 'fly.io'], 0.7);
    }

    // Check for static HTML
    if (this.isStatic(files)) {
      return this.createDetection('static', 'Static HTML', 'netlify', ['vercel', 'cloudflare-pages'], 0.6);
    }

    // Default/Unknown
    return this.createDetection('unknown', 'Unknown', 'vercel', ['netlify', 'railway'], 0.3);
  }

  /**
   * Check if project is Next.js
   */
  private isNextJs(files: Record<string, any>): boolean {
    return !!(
      files['next.config.js'] ||
      files['next.config.ts'] ||
      files['next.config.mjs'] ||
      (files['package.json'] && this.hasPackage(files['package.json'], 'next'))
    );
  }

  /**
   * Check if project is React with Vite
   */
  private isReactVite(files: Record<string, any>): boolean {
    const pkgJson = files['package.json'];
    return !!(
      files['vite.config.js'] ||
      files['vite.config.ts'] ||
      (pkgJson && this.hasPackage(pkgJson, 'react') && this.hasPackage(pkgJson, 'vite', 'dev'))
    );
  }

  /**
   * Check if project is React with Create React App
   */
  private isReactCRA(files: Record<string, any>): boolean {
    const pkgJson = files['package.json'];
    return !!(pkgJson && this.hasPackage(pkgJson, 'react') && this.hasPackage(pkgJson, 'react-scripts'));
  }

  /**
   * Check if project is Vue
   */
  private isVue(files: Record<string, any>): boolean {
    return !!(
      files['vue.config.js'] ||
      files['vite.config.js'] ||
      (files['package.json'] && this.hasPackage(files['package.json'], 'vue'))
    );
  }

  /**
   * Check if project is Svelte
   */
  private isSvelte(files: Record<string, any>): boolean {
    return !!(
      files['svelte.config.js'] ||
      (files['package.json'] && this.hasPackage(files['package.json'], 'svelte'))
    );
  }

  /**
   * Check if project is Angular
   */
  private isAngular(files: Record<string, any>): boolean {
    return !!(
      files['angular.json'] ||
      (files['package.json'] && this.hasPackage(files['package.json'], '@angular/core'))
    );
  }

  /**
   * Check if project is Express
   */
  private isNodeExpress(files: Record<string, any>): boolean {
    const pkgJson = files['package.json'];
    return !!(
      (files['server.js'] && pkgJson && this.hasPackage(pkgJson, 'express')) ||
      (files['app.js'] && pkgJson && this.hasPackage(pkgJson, 'express'))
    );
  }

  /**
   * Check if project is generic Node.js
   */
  private isNode(files: Record<string, any>): boolean {
    return !!(
      files['package.json'] ||
      files['server.js'] ||
      files['index.js'] ||
      files['app.js']
    );
  }

  /**
   * Check if project is static HTML
   */
  private isStatic(files: Record<string, any>): boolean {
    return !!(files['index.html'] && !files['package.json']);
  }

  /**
   * Check if package.json has a dependency
   */
  private hasPackage(pkgJsonContent: any, packageName: string, section: 'dependencies' | 'devDependencies' | 'dev' = 'dependencies'): boolean {
    try {
      const pkg = typeof pkgJsonContent === 'string' ? JSON.parse(pkgJsonContent) : pkgJsonContent;
      
      if (section === 'dev') {
        return !!(pkg.devDependencies?.[packageName]);
      }
      
      return !!(pkg[section]?.[packageName] || pkg.dependencies?.[packageName] || pkg.devDependencies?.[packageName]);
    } catch {
      return false;
    }
  }

  /**
   * Create detection result
   */
  private createDetection(
    type: ProjectFramework,
    framework: string,
    recommended: DeploymentPlatform,
    alternatives: DeploymentPlatform[],
    confidence: number
  ): ProjectDetection {
    const buildConfig = this.getBuildConfig(type);
    
    return {
      type,
      framework,
      buildCommand: buildConfig.buildCommand,
      startCommand: buildConfig.startCommand,
      outputDir: buildConfig.outputDir,
      recommendedPlatform: recommended,
      alternatives,
      confidence,
    };
  }

  /**
   * Get build configuration for framework
   */
  private getBuildConfig(type: ProjectFramework): {
    buildCommand: string;
    startCommand?: string;
    outputDir?: string;
  } {
    const configs: Record<ProjectFramework, any> = {
      nextjs: {
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        outputDir: '.next',
      },
      react: {
        buildCommand: 'npm run build',
        outputDir: 'dist',
      },
      vue: {
        buildCommand: 'npm run build',
        outputDir: 'dist',
      },
      svelte: {
        buildCommand: 'npm run build',
        outputDir: 'build',
      },
      angular: {
        buildCommand: 'npm run build',
        outputDir: 'dist',
      },
      static: {
        buildCommand: 'echo "No build required"',
        outputDir: '.',
      },
      node: {
        buildCommand: 'npm install',
        startCommand: 'npm start',
      },
      express: {
        buildCommand: 'npm install',
        startCommand: 'node server.js',
      },
      fastify: {
        buildCommand: 'npm install',
        startCommand: 'npm start',
      },
      unknown: {
        buildCommand: 'npm run build',
        outputDir: 'dist',
      },
    };

    return configs[type] || configs.unknown;
  }

  /**
   * Get build command from package.json scripts
   */
  getBuildCommandFromPackageJson(pkgJson: any): string | undefined {
    try {
      const pkg = typeof pkgJson === 'string' ? JSON.parse(pkgJson) : pkgJson;
      return pkg.scripts?.build;
    } catch {
      return undefined;
    }
  }

  /**
   * Get start command from package.json scripts
   */
  getStartCommandFromPackageJson(pkgJson: any): string | undefined {
    try {
      const pkg = typeof pkgJson === 'string' ? JSON.parse(pkgJson) : pkgJson;
      return pkg.scripts?.start;
    } catch {
      return undefined;
    }
  }
}

// Export singleton
export const projectDetector = new ProjectDetector();
