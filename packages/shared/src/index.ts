/**
 * Shared utilities and types for Recoder
 */

export { Logger } from './logger';
export { RecoderError, ErrorCode, ErrorHandler } from './errors';
export * from './types';

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