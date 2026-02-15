/**
 * Utility Functions
 *
 * General-purpose utility functions and helpers
 */

// Core utilities
export * from './utils';
export * from './uuid';
export * from './date';
export * from './search';

// Theme & styling
export * from './theme';
export * from './fonts';
export * from './icon-mapping';

// Parsing & formatting
// message-grouping moved to @recoder/shared/utils
// tool-parser moved to @recoder/shared/tools
// tool-display moved to @recoder/shared/tools
// credit-formatter moved to @recoder/shared
export { formatCredits, formatCreditsWithSign, dollarsToCredits, creditsToDollars, formatDollarsAsCredits, CREDITS_PER_DOLLAR } from '@recoder/shared';

// Streaming & tool call utilities (portable from frontend)
// streaming-utils moved to @recoder/shared/streaming
// Note: tool-call-utils re-exports ToolResultData from @recoder/shared/tools,
// and tool-data-extractor also defines its own ToolResultData.
// We use explicit named exports to avoid ambiguity (TS2308).
export {
  parseToolCallArguments,
  normalizeToolName,
  getToolDisplayParam,
  parseToolCallForDisplay,
  extractAndParseToolCalls,
  isFileOperationTool,
  isCommandTool,
  isWebTool,
  getToolCategory,
  type ToolCategory,
  type ParsedToolCallData,
} from './tool-call-utils';
export {
  extractToolCall,
  extractToolResult,
  extractToolCallFromToolMessage,
  extractToolData,
  extractToolCallAndResult,
} from './tool-data-extractor';
export type { ToolCallData, ToolResultData } from './tool-data-extractor';

// Domain-specific utilities
export * from './thread-utils';
export * from './trigger-utils';
export * from './model-provider';
export * from './error-handler';

// Type definitions
export * from './auth-types';

// i18n
export * from './i18n';
