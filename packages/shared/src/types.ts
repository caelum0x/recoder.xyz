/**
 * Shared types for Recoder platform
 */

// Base types for the platform
export interface ProjectConfig {
  name: string;
  type: string;
  version: string;
  description?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  preferences?: Record<string, any>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface ProviderConfig {
  name: string;
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
}

// Re-export from types directory
export * from './types/index';