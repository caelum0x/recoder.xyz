/**
 * Unified Auth Types
 */

export interface AuthConfig {
  apiUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
  storage?: 'localStorage' | 'file' | 'memory';
  syncEnabled?: boolean;
  platform: Platform;
}

export type Platform = 'web' | 'extension' | 'cli' | 'router';

export interface UserSession {
  id: string;
  userId: string;
  email: string;
  username?: string;
  platform: Platform;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
  metadata?: Record<string, any>;
}

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope?: string;
  issuedAt: Date;
}

export interface SyncData {
  userId: string;
  projects: ProjectSync[];
  settings: SettingsSync;
  aiContexts: AIContextSync[];
  lastSyncAt: Date;
}

export interface ProjectSync {
  id: string;
  name: string;
  path: string;
  platform: Platform;
  lastModified: Date;
  config?: Record<string, any>;
}

export interface SettingsSync {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  aiProviders: AIProviderConfig[];
  preferences: Record<string, any>;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  enabled: boolean;
}

export interface AIContextSync {
  id: string;
  projectId: string;
  context: string;
  platform: Platform;
  createdAt: Date;
}

export interface AuthProvider {
  login(credentials: LoginCredentials): Promise<AuthToken>;
  logout(): Promise<void>;
  refreshToken(refreshToken: string): Promise<AuthToken>;
  validateToken(token: string): Promise<boolean>;
  getUserInfo(token: string): Promise<UserInfo>;
}

export interface LoginCredentials {
  email?: string;
  username?: string;
  password?: string;
  token?: string; // For token-based auth
}

export interface UserInfo {
  id: string;
  email: string;
  username?: string;
  avatar?: string;
  subscription?: {
    plan: string;
    isActive: boolean;
    expiresAt?: Date;
  };
}