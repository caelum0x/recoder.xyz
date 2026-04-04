/**
 * @recoder/shared
 * 
 * Shared code between frontend (Next.js) and mobile (React Native) applications.
 * This package contains platform-agnostic types, utilities, and business logic.
 * 
 * @example
 * // Import types
 * import type { UnifiedMessage, ParsedContent } from '@recoder/shared/types';
 * 
 * // Import streaming utilities
 * import { extractTextFromPartialJson, isAskOrCompleteTool } from '@recoder/shared/streaming';
 * 
 * // Import tool utilities
 * import { getUserFriendlyToolName, getToolIconKey } from '@recoder/shared/tools';
 * 
 * // Import general utilities
 * import { safeJsonParse, groupMessages } from '@recoder/shared/utils';
 * 
 * // Import animation utilities
 * import { useSmoothText, useSmoothToolField } from '@recoder/shared/animations';
 */

// Re-export everything for convenience
export * from './types';
export * from './streaming';
export * from './tools';
export * from './utils';
export * from './animations';
export * from './constants/upload-limits';
export * from './errors';
export * from './opencode-client';
// Note: a2a is server-only (uses Redis) - import via '@recoder/shared/a2a' directly
