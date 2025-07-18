/**
 * Recoder Shared Utilities
 * Common types, utilities, and constants shared across all packages
 */

// Core types
export * from './types';

// Error handling
export * from './errors';

// Logger
export * from './logger';

// Constants
export * from './constants';

// Utilities
export * from './utils';

// Legacy exports for backward compatibility
export interface ProjectPlan {
  name: string;
  description: string;
  architecture: string;
  features: string[];
  integrations: string[];
  dependencies: Record<string, string>;
}

export interface CodeGenerationOptions {
  outputDir: string;
  template: string;
  variables: Record<string, any>;
  skipExisting: boolean;
}

// Simple logger class for backward compatibility
export class Logger {
  static info(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  static error(message: string): void {
    console.error(`[ERROR] ${message}`);
  }

  static warn(message: string): void {
    console.warn(`[WARN] ${message}`);
  }
}

export const VERSION = '1.0.0';