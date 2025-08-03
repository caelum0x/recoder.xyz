/**
 * Factory function to create unified auth instances
 */

import { UnifiedAuthProvider } from './auth-provider';
import { CrossPlatformSync } from './cross-platform-sync';
import type { AuthConfig, Platform } from './types';

/**
 * Create a unified auth instance with default configuration
 */
export function createUnifiedAuth(config: Partial<AuthConfig>): {
  auth: UnifiedAuthProvider;
  sync: CrossPlatformSync;
} {
  const defaultConfig: AuthConfig = {
    apiUrl: 'https://api.recoder.xyz',
    clientId: 'recoder-unified-client',
    storage: getDefaultStorage(config.platform || 'web'),
    syncEnabled: true,
    platform: config.platform || 'web',
    scopes: ['read', 'write', 'sync'],
  };

  const mergedConfig = { ...defaultConfig, ...config };

  const auth = new UnifiedAuthProvider(mergedConfig);
  const sync = new CrossPlatformSync(mergedConfig);

  return { auth, sync };
}

/**
 * Get default storage type based on platform
 */
function getDefaultStorage(platform: Platform): 'localStorage' | 'file' | 'memory' {
  switch (platform) {
    case 'web':
      return 'localStorage';
    case 'extension':
    case 'cli':
    case 'router':
      return 'file';
    default:
      return 'memory';
  }
}

/**
 * Platform-specific auth configurations
 */
export const platformConfigs = {
  web: {
    platform: 'web' as Platform,
    storage: 'localStorage' as const,
    redirectUri: 'https://web.recoder.xyz/auth/callback',
  },
  
  extension: {
    platform: 'extension' as Platform,
    storage: 'file' as const,
    redirectUri: 'vscode://recoder.recoder-vscode/auth',
  },
  
  cli: {
    platform: 'cli' as Platform,
    storage: 'file' as const,
    redirectUri: 'http://localhost:3000/auth/callback',
  },
  
  router: {
    platform: 'router' as Platform,
    storage: 'file' as const,
    redirectUri: 'http://localhost:8080/auth/callback',
  },
};

/**
 * Create platform-specific auth instance
 */
export function createPlatformAuth(platform: Platform, additionalConfig?: Partial<AuthConfig>) {
  const platformConfig = platformConfigs[platform];
  
  return createUnifiedAuth({
    ...platformConfig,
    ...additionalConfig,
  });
}