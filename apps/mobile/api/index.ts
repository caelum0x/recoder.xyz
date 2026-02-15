/**
 * API Module Exports
 * 
 * Configuration, types, and auth provider client
 * (All hooks moved to /hooks/api)
 */

// Configuration
export * from './config';

// Types
export * from './types';

// Auth provider config helpers
export { authProviderAnonKey, getAuthProviderOrigin, getAuthProviderApiBase } from './auth-provider';
