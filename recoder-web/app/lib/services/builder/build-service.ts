/**
 * Build Service
 *
 * Core service for executing Vite builds and managing the build process.
 * Provides progress tracking, error handling, and artifact management.
 */

import { atom, computed } from 'nanostores';
import { dockerPost } from '../docker-api';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('BuildService');

// ============================================
// Types
// ============================================

export interface BuildConfig {
  /** Project ID for the build */
  projectId: string;
  /** Root directory for the build (relative to project) */
  rootDir?: string;
  /** Output directory for build artifacts */
  outDir?: string;
  /** Build mode (development/production) */
  mode?: 'development' | 'production';
  /** Enable source maps */
  sourcemap?: boolean;
  /** Minify output */
  minify?: boolean;
  /** Custom environment variables */
  env?: Record<string, string>;
  /** Build timeout in milliseconds */
  timeout?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Framework-specific options */
  framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'vanilla';
  /** Additional Vite config overrides */
  viteConfig?: Record<string, unknown>;
}

export type BuildStatus =
  | 'idle'
  | 'preparing'
  | 'installing'
  | 'building'
  | 'optimizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BuildProgress {
  /** Current build status */
  status: BuildStatus;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Current step description */
  step: string;
  /** Elapsed time in milliseconds */
  elapsed: number;
  /** Estimated remaining time in milliseconds */
  remaining?: number;
  /** Build logs */
  logs: string[];
}

export interface BuildError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** File path if applicable */
  file?: string;
  /** Line number if applicable */
  line?: number;
  /** Column number if applicable */
  column?: number;
  /** Stack trace */
  stack?: string;
  /** Suggested fix */
  suggestion?: string;
}

export interface BuildArtifact {
  /** Artifact file path */
  path: string;
  /** File size in bytes */
  size: number;
  /** Content hash */
  hash: string;
  /** MIME type */
  type: string;
  /** Whether this is an entry point */
  isEntry?: boolean;
}

export interface BuildResult {
  /** Whether the build succeeded */
  success: boolean;
  /** Build status */
  status: BuildStatus;
  /** Build duration in milliseconds */
  duration: number;
  /** Build artifacts */
  artifacts: BuildArtifact[];
  /** Build errors (if any) */
  errors: BuildError[];
  /** Build warnings */
  warnings: string[];
  /** Output directory */
  outDir: string;
  /** Total output size in bytes */
  totalSize: number;
  /** Build logs */
  logs: string[];
  /** Build metadata */
  metadata: {
    viteVersion?: string;
    nodeVersion?: string;
    buildTime: string;
    config: Partial<BuildConfig>;
  };
}

// ============================================
// State Management
// ============================================

/** Current build status store */
export const buildStatus = atom<BuildStatus>('idle');

/** Current build progress store */
export const buildProgress = atom<BuildProgress>({
  status: 'idle',
  percentage: 0,
  step: '',
  elapsed: 0,
  logs: [],
});

/** Build errors store */
export const buildErrors = atom<BuildError[]>([]);

/** Build result store */
export const buildResult = atom<BuildResult | null>(null);

/** Is build in progress */
export const isBuildInProgress = computed(buildStatus, (status) =>
  ['preparing', 'installing', 'building', 'optimizing'].includes(status)
);

// ============================================
// Build Service Class
// ============================================

export class BuildService {
  private config: BuildConfig;
  private abortController: AbortController | null = null;
  private startTime: number = 0;
  private logs: string[] = [];

  constructor(config: BuildConfig) {
    this.config = {
      rootDir: '.',
      outDir: 'dist',
      mode: 'production',
      sourcemap: false,
      minify: true,
      timeout: 300000, // 5 minutes default
      verbose: false,
      framework: 'react',
      ...config,
    };
  }

  /**
   * Execute the build process
   */
  async build(): Promise<BuildResult> {
    this.abortController = new AbortController();
    this.startTime = Date.now();
    this.logs = [];

    try {
      // Reset state
      buildStatus.set('preparing');
      buildErrors.set([]);
      this.updateProgress(0, 'Preparing build environment...');

      // Step 1: Validate configuration
      this.log('Validating build configuration...');
      const configValid = await this.validateConfig();
      if (!configValid.valid) {
        throw new Error(`Invalid configuration: ${configValid.error}`);
      }
      this.updateProgress(10, 'Configuration validated');

      // Step 2: Install dependencies if needed
      buildStatus.set('installing');
      this.updateProgress(15, 'Checking dependencies...');
      await this.ensureDependencies();
      this.updateProgress(30, 'Dependencies ready');

      // Step 3: Execute Vite build
      buildStatus.set('building');
      this.updateProgress(35, 'Starting Vite build...');
      const buildOutput = await this.executeViteBuild();
      this.updateProgress(80, 'Build completed');

      // Step 4: Optimize and finalize
      buildStatus.set('optimizing');
      this.updateProgress(85, 'Optimizing output...');
      const artifacts = await this.collectArtifacts();
      this.updateProgress(95, 'Finalizing...');

      // Complete
      const result: BuildResult = {
        success: true,
        status: 'completed',
        duration: Date.now() - this.startTime,
        artifacts,
        errors: [],
        warnings: buildOutput.warnings || [],
        outDir: this.config.outDir!,
        totalSize: artifacts.reduce((sum, a) => sum + a.size, 0),
        logs: this.logs,
        metadata: {
          viteVersion: buildOutput.viteVersion,
          nodeVersion: buildOutput.nodeVersion,
          buildTime: new Date().toISOString(),
          config: {
            mode: this.config.mode,
            sourcemap: this.config.sourcemap,
            minify: this.config.minify,
            framework: this.config.framework,
          },
        },
      };

      buildStatus.set('completed');
      buildResult.set(result);
      this.updateProgress(100, 'Build successful!');

      return result;
    } catch (error) {
      const buildError = this.parseError(error);
      buildErrors.set([buildError]);
      buildStatus.set('failed');

      const result: BuildResult = {
        success: false,
        status: 'failed',
        duration: Date.now() - this.startTime,
        artifacts: [],
        errors: [buildError],
        warnings: [],
        outDir: this.config.outDir!,
        totalSize: 0,
        logs: this.logs,
        metadata: {
          buildTime: new Date().toISOString(),
          config: this.config,
        },
      };

      buildResult.set(result);
      return result;
    }
  }

  /**
   * Cancel the current build
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      buildStatus.set('cancelled');
      this.log('Build cancelled by user');
    }
  }

  /**
   * Validate build configuration
   */
  private async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    if (!this.config.projectId) {
      return { valid: false, error: 'Project ID is required' };
    }

    // Check if project exists
    try {
      const response = await dockerPost<{ exists: boolean }>(
        `/api/files/${this.config.projectId}/exists`,
        { path: 'package.json' }
      );

      if (!response.exists) {
        return { valid: false, error: 'package.json not found in project' };
      }
    } catch {
      return { valid: false, error: 'Failed to verify project structure' };
    }

    return { valid: true };
  }

  /**
   * Ensure dependencies are installed
   */
  private async ensureDependencies(): Promise<void> {
    this.log('Checking if node_modules exists...');

    try {
      const response = await dockerPost<{ exists: boolean }>(
        `/api/files/${this.config.projectId}/exists`,
        { path: 'node_modules' }
      );

      if (!response.exists) {
        this.log('Installing dependencies...');
        const installResult = await dockerPost<{ success: boolean; output: string; error?: string }>(
          `/api/shell/${this.config.projectId}`,
          {
            command: 'bun install || npm install',
            timeout: 120000, // 2 minutes for install
            cwd: this.config.rootDir,
          }
        );

        if (!installResult.success) {
          throw new Error(`Dependency installation failed: ${installResult.error || 'Unknown error'}`);
        }

        this.log('Dependencies installed successfully');
      } else {
        this.log('Dependencies already installed');
      }
    } catch (error) {
      throw new Error(`Failed to ensure dependencies: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute the Vite build command
   */
  private async executeViteBuild(): Promise<{
    success: boolean;
    output: string;
    warnings: string[];
    viteVersion?: string;
    nodeVersion?: string;
  }> {
    this.log(`Starting Vite build (mode: ${this.config.mode})...`);

    // Build the command
    const envVars = this.config.env
      ? Object.entries(this.config.env)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ')
      : '';

    const buildArgs = [
      `--mode ${this.config.mode}`,
      `--outDir ${this.config.outDir}`,
      this.config.sourcemap ? '--sourcemap' : '',
      this.config.minify ? '--minify' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const command = `${envVars} npx vite build ${buildArgs}`.trim();

    this.log(`Executing: ${command}`);

    try {
      const result = await dockerPost<{
        success: boolean;
        output: string;
        error?: string;
        exitCode: number;
      }>(
        `/api/shell/${this.config.projectId}`,
        {
          command,
          timeout: this.config.timeout,
          cwd: this.config.rootDir,
        }
      );

      // Parse output for warnings
      const warnings = this.extractWarnings(result.output);

      // Log build output
      result.output.split('\n').forEach(line => {
        if (line.trim()) {
          this.log(line);
        }
      });

      if (!result.success || result.exitCode !== 0) {
        throw new Error(result.error || result.output || 'Build failed');
      }

      // Extract version info
      const viteVersionMatch = result.output.match(/vite v([\d.]+)/i);
      const nodeVersionMatch = result.output.match(/node v([\d.]+)/i);

      return {
        success: true,
        output: result.output,
        warnings,
        viteVersion: viteVersionMatch?.[1],
        nodeVersion: nodeVersionMatch?.[1],
      };
    } catch (error) {
      throw new Error(`Vite build failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Collect build artifacts from output directory
   */
  private async collectArtifacts(): Promise<BuildArtifact[]> {
    this.log(`Collecting artifacts from ${this.config.outDir}...`);

    try {
      const result = await dockerPost<{
        success: boolean;
        files: Array<{
          path: string;
          size: number;
          hash: string;
          type: string;
        }>;
        error?: string;
      }>(
        `/api/files/${this.config.projectId}/list-recursive`,
        {
          path: this.config.outDir,
          includeHashes: true,
        }
      );

      if (!result.success) {
        this.log(`Warning: Could not list artifacts: ${result.error}`);
        return [];
      }

      const artifacts: BuildArtifact[] = result.files.map(file => ({
        path: file.path,
        size: file.size,
        hash: file.hash,
        type: this.getMimeType(file.path),
        isEntry: this.isEntryFile(file.path),
      }));

      this.log(`Found ${artifacts.length} artifacts (${this.formatSize(artifacts.reduce((s, a) => s + a.size, 0))})`);

      return artifacts;
    } catch (error) {
      this.log(`Warning: Failed to collect artifacts: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Extract warnings from build output
   */
  private extractWarnings(output: string): string[] {
    const warnings: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (
        line.toLowerCase().includes('warning') ||
        line.includes('WARN') ||
        line.includes('\u26A0')
      ) {
        warnings.push(line.trim());
      }
    }

    return warnings;
  }

  /**
   * Parse an error into a BuildError
   */
  private parseError(error: unknown): BuildError {
    const message = error instanceof Error ? error.message : String(error);

    // Try to extract file/line info
    const fileMatch = message.match(/([^\s]+\.[jt]sx?):(\d+)(?::(\d+))?/);
    const codeMatch = message.match(/\[([A-Z_]+)\]/);

    return {
      code: codeMatch?.[1] || 'BUILD_ERROR',
      message,
      file: fileMatch?.[1],
      line: fileMatch?.[2] ? parseInt(fileMatch[2], 10) : undefined,
      column: fileMatch?.[3] ? parseInt(fileMatch[3], 10) : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      suggestion: this.getSuggestion(message),
    };
  }

  /**
   * Get a suggestion for fixing an error
   */
  private getSuggestion(errorMessage: string): string | undefined {
    const message = errorMessage.toLowerCase();

    if (message.includes('cannot find module') || message.includes('failed to resolve import')) {
      return 'Try running "npm install" or "bun install" to install missing dependencies';
    }

    if (message.includes('syntax error') || message.includes('unexpected token')) {
      return 'Check your code for syntax errors, especially missing brackets or semicolons';
    }

    if (message.includes('out of memory') || message.includes('heap')) {
      return 'Try increasing Node.js memory limit with NODE_OPTIONS="--max-old-space-size=4096"';
    }

    if (message.includes('permission denied')) {
      return 'Check file permissions in the output directory';
    }

    return undefined;
  }

  /**
   * Get MIME type for a file
   */
  private getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();

    const mimeTypes: Record<string, string> = {
      js: 'application/javascript',
      mjs: 'application/javascript',
      cjs: 'application/javascript',
      css: 'text/css',
      html: 'text/html',
      json: 'application/json',
      svg: 'image/svg+xml',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      woff: 'font/woff',
      woff2: 'font/woff2',
      ttf: 'font/ttf',
      eot: 'application/vnd.ms-fontobject',
      map: 'application/json',
    };

    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * Check if a file is an entry point
   */
  private isEntryFile(filePath: string): boolean {
    const name = filePath.split('/').pop() || '';
    return (
      name.startsWith('index.') ||
      name.includes('.entry.') ||
      name.includes('-entry.') ||
      /^main\.[jt]s/.test(name)
    );
  }

  /**
   * Format file size for display
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.logs.push(logEntry);

    if (this.config.verbose) {
      logger.info(`[BuildService] ${message}`);
    }
  }

  /**
   * Update build progress
   */
  private updateProgress(percentage: number, step: string): void {
    buildProgress.set({
      status: buildStatus.get(),
      percentage,
      step,
      elapsed: Date.now() - this.startTime,
      remaining: percentage > 0 ? ((100 - percentage) / percentage) * (Date.now() - this.startTime) : undefined,
      logs: [...this.logs],
    });
  }
}

// ============================================
// Factory Functions
// ============================================

let currentService: BuildService | null = null;

/**
 * Create a new build service instance
 */
export function createBuildService(config: BuildConfig): BuildService {
  return new BuildService(config);
}

/**
 * Get or create the build service
 */
export function getBuildService(config: BuildConfig): BuildService {
  if (!currentService || currentService['config'].projectId !== config.projectId) {
    currentService = createBuildService(config);
  }
  return currentService;
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Execute a build with the given configuration
 */
export async function executeBuild(config: BuildConfig): Promise<BuildResult> {
  const service = createBuildService(config);
  return service.build();
}

/**
 * Execute a build with progress callbacks
 */
export async function executeBuildWithProgress(
  config: BuildConfig,
  onProgress: (progress: BuildProgress) => void
): Promise<BuildResult> {
  const service = createBuildService(config);

  // Subscribe to progress updates
  const unsubscribe = buildProgress.subscribe(onProgress);

  try {
    return await service.build();
  } finally {
    unsubscribe();
  }
}

/**
 * Validate a build configuration
 */
export function validateBuildConfig(config: Partial<BuildConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.projectId) {
    errors.push('Project ID is required');
  }

  if (config.mode && !['development', 'production'].includes(config.mode)) {
    errors.push('Mode must be "development" or "production"');
  }

  if (config.timeout && (config.timeout < 1000 || config.timeout > 600000)) {
    errors.push('Timeout must be between 1000ms and 600000ms');
  }

  if (config.framework && !['react', 'vue', 'svelte', 'solid', 'vanilla'].includes(config.framework)) {
    errors.push('Invalid framework specified');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate build output directory
 */
export async function validateBuildOutput(
  projectId: string,
  outDir: string = 'dist'
): Promise<{
  valid: boolean;
  hasIndex: boolean;
  files: string[];
  totalSize: number;
}> {
  try {
    const result = await dockerPost<{
      success: boolean;
      files: Array<{ path: string; size: number }>;
      error?: string;
    }>(
      `/api/files/${projectId}/list-recursive`,
      { path: outDir }
    );

    if (!result.success) {
      return {
        valid: false,
        hasIndex: false,
        files: [],
        totalSize: 0,
      };
    }

    const files = result.files.map(f => f.path);
    const hasIndex = files.some(f => f.endsWith('index.html'));
    const totalSize = result.files.reduce((sum, f) => sum + f.size, 0);

    return {
      valid: files.length > 0,
      hasIndex,
      files,
      totalSize,
    };
  } catch {
    return {
      valid: false,
      hasIndex: false,
      files: [],
      totalSize: 0,
    };
  }
}

/**
 * Clean build artifacts
 */
export async function cleanBuildArtifacts(
  projectId: string,
  outDir: string = 'dist'
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await dockerPost<{ success: boolean; error?: string }>(
      `/api/shell/${projectId}`,
      {
        command: `rm -rf ${outDir}`,
        timeout: 10000,
      }
    );

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
