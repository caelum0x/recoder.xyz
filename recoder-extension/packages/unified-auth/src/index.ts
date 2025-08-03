/**
 * Unified Authentication and Session Management for recoder.xyz
 * 
 * Provides seamless auth across recoder-web, extension, CLI, and router
 */

export { UnifiedAuthProvider } from './auth-provider';
export { SessionManager } from './session-manager';
export { TokenManager } from './token-manager';
export { CrossPlatformSync } from './cross-platform-sync';

export type {
  AuthConfig,
  UserSession,
  AuthToken,
  Platform,
  SyncData,
  AuthProvider,
} from './types';

export { createUnifiedAuth } from './factory';