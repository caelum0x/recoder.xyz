/**
 * Shared utilities and types for Recoder
 */

export { Logger } from './logger';
export { RecoderError, ErrorCode, ErrorHandler } from './errors';
export * from './types';

// API and utility exports
export * from './api';
export * from './cost';
export * from './safeJsonParse';
export * from './vsCodeSelectorUtils';
export * from './cerebras';
export * from './reasoning';
export * from './package';
export * from './fireworks';
export * from './bedrock-types';
export * from './anthropic-types';  
export * from './other-provider-types';
export * from './file-utils';

// OAuth and Auth exports
export { OAuthHandler, OAuthCallbackData } from './oauth-handler';
export { AuthClient } from './auth-client';

// Re-export specific items from @roo-code/types to avoid conflicts
export type {
  ModelInfo as RooModelInfo,
  ProviderSettings as RooProviderSettings
} from '@roo-code/types';

// Constants with type aliases to avoid conflicts - export only what exists
export {
  TEMPLATE_CATEGORIES,
  FRAMEWORK_TYPES,
  PROJECT_TYPES,
  COMPLEXITY_LEVELS,
  INTEGRATION_CATEGORIES,
  VALIDATION_RULES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  EXTENSIONS,
  FEATURE_FLAGS,
  
  // Type exports with prefixes to avoid conflicts
  TemplateCategory,
  FrameworkType,
  ProjectType as ConstantProjectType,
  ComplexityLevel,
  IntegrationCategory
} from './constants';

export * from './utils';

// Version export
export const VERSION = '1.0.0';