/**
 * Common utility functions for the deploy-workflow service
 * Adapted from libra/apps/deploy
 */

/**
 * File patterns to exclude from deployment
 */
const EXCLUDED_PATTERNS = [
  'node_modules',
  '.git',
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '.nyc_output',
  '.cache',
  '.parcel-cache',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  '*.tmp',
  '*.temp'
];

/**
 * Check if a file path should be excluded from deployment
 */
export function isExcludedFile(path: string): boolean {
  return EXCLUDED_PATTERNS.some(pattern => {
    if (pattern.includes('*')) {
      // Handle wildcard patterns
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(path);
    }
    return path.includes(pattern);
  });
}

/**
 * Generate a unique deployment ID
 */
export function generateDeploymentId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `deploy_${timestamp}_${random}`;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate a unique batch ID
 */
export function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Validate project ID format
 */
export function isValidProjectId(projectId: string): boolean {
  // Project IDs should be alphanumeric with hyphens, 3-50 characters
  const regex = /^[a-zA-Z0-9-]{3,50}$/;
  return regex.test(projectId);
}

/**
 * Validate organization ID format
 */
export function isValidOrganizationId(orgId: string): boolean {
  // Organization IDs should be UUIDs or similar format
  const regex = /^[a-zA-Z0-9-_]{8,50}$/;
  return regex.test(orgId);
}

/**
 * Validate user ID format
 */
export function isValidUserId(userId: string): boolean {
  // User IDs should be UUIDs or similar format
  const regex = /^[a-zA-Z0-9-_]{8,50}$/;
  return regex.test(userId);
}

/**
 * Sanitize file path for security
 */
export function sanitizeFilePath(path: string): string {
  // Remove any path traversal attempts
  return path
    .replace(/\.\./g, '')
    .replace(/\/+/g, '/')
    .replace(/^\//, '');
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error = new Error('No attempts made');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        break;
      }

      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Truncate string to specified length
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }

  return obj;
}

/**
 * Check if object is empty
 */
export function isEmpty(obj: any): boolean {
  if (obj == null) return true;
  if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}

/**
 * Parse boolean from string
 */
export function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse integer from string with default
 */
export function parseInteger(value: string | undefined, defaultValue: number = 0): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Deployment configuration constants
 */
export const DEPLOYMENT_CONFIG = {
  /** Project path in sandbox */
  PROJECT_PATH: '/home/user/project',
  /** Default deployment timeout in milliseconds */
  TIMEOUT: 600000, // 10 minutes
  /** Build step timeout */
  BUILD_TIMEOUT: 300000, // 5 minutes
  /** Deploy step timeout */
  DEPLOY_TIMEOUT: 180000, // 3 minutes
  /** Sync step timeout */
  SYNC_TIMEOUT: 60000, // 1 minute
  /** Command execution timeout */
  COMMAND_TIMEOUT: 30000, // 30 seconds
  /** Max retry attempts */
  MAX_RETRIES: 3,
  /** Default sandbox template */
  DEFAULT_TEMPLATE: 'ubuntu-node',
  /** Sandbox templates by provider */
  TEMPLATES: {
    E2B: 'ubuntu-node',
    DAYTONA: 'ubuntu-node'
  }
};
