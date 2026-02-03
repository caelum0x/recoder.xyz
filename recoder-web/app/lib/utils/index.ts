/**
 * Centralized utilities export
 * Provides convenient access to all utility modules
 */

// Logger
export { logger, log, LogLevel } from './logger';
export type { LogContext } from './logger';

// Error handling with Result type pattern
export {
  tryCatch,
  isSuccess,
  isFailure,
  mapResult,
  mapError,
  chainResults,
  collectResults,
  unwrap,
  unwrapOr,
  unwrapOrElse,
} from './try-catch';
export type { Result, AsyncResult } from './try-catch';

// File types and utilities
export {
  // Types
  type FileType,
  type TFolder,
  type TFile,
  type TTab,
  type FileContentMap,
  type TreeNode,
  type FileEntry,
  type DirectoryEntry,
  type FileOrDirEntry,
  type FileStructure,
  type GetFileContentInput,
  type FileDiffType,
  // Schemas
  fileEntrySchema,
  directoryEntrySchema,
  fileOrDirEntrySchema,
  fileStructureSchema,
  getFileContentSchema,
  // Utilities
  isFile,
  isDirectory,
  getFileExtension,
  getBasename,
  getDirname,
  joinPath,
  normalizePath,
  isAbsolutePath,
  getRelativePath,
  isBinaryFile,
  getMimeType,
  shouldIgnoreFile,
  sortFileEntries,
  fileMapToTree,
  validateFileStructure,
} from './file-types';

// GitHub integration
export {
  // Types
  type GithubNodeBase,
  type GitHubFileNode,
  type GitHubRepository,
  type GitHubBranch,
  type GitHubCommit,
  type GitHubApiError,
  type GitHubFileContent,
  type GitHubDirectoryContent,
  type GitHubTree,
  // Schemas
  githubNodeBaseSchema,
  githubFileNodeSchema,
  getFileContentSchema as githubGetFileContentSchema,
  // Utilities
  parseGitHubUrl,
  buildGitHubContentsUrl,
  buildGitHubTreeUrl,
  buildGitHubRawUrl,
  decodeGitHubContent,
  encodeGitHubContent,
  createGitHubHeaders,
  isRateLimitError,
  getRateLimitReset,
  treeToFileNodes,
  flattenFileNodes,
  filterFileNodes,
  validateGitHubFileNode,
} from './github';

// Message types
export {
  // Types
  type ContentType,
  type FileType as MessageFileType,
  type FileDiffType as MessageFileDiffType,
  type UserMessageType,
  type CommandMessageType,
  type DiffMessageType,
  type PlanMessageType,
  type ThinkingMessageType,
  type ScreenshotMessageType,
  type TimingMessageType,
  type ErrorMessageType,
  type StatusMessageType,
  type AssistantMessageType,
  type MessageType,
  type HistoryType,
  // Type guards
  isUserMessage,
  isAssistantMessage,
  isDiffMessage,
  isCommandMessage,
  isPlanMessage,
  isThinkingMessage,
  isScreenshotMessage,
  isTimingMessage,
  isErrorMessage,
  isStatusMessage,
  // Utilities
  getMessageContent,
  createUserMessage,
  createAssistantMessage,
  createErrorMessage,
  createThinkingMessage,
  createDiffMessage,
  generateMessageId,
  filterMessagesByType,
  getLatestMessageOfType,
  countMessagesByType,
} from './message-types';

// CDN utilities
export {
  CDNUtils,
  getCdnUrl,
  getCdnImageUrl,
  getCdnFileUrl,
  getCdnUploadUrl,
  getCdnScreenshotUrl,
  getCdnScreenshotUploadUrl,
  getCdnStaticAssetUrl,
  getCdnProjectFilesUrl,
  getCdnThumbnailUrl,
} from './cdn-utils';

// Database error handling
export {
  DatabaseErrorType,
  DatabaseError,
  DB_ERROR_MESSAGES,
  classifyDatabaseError,
  transformDatabaseError,
  isDatabaseError,
  withDatabaseErrorHandling,
  withDatabaseRetry,
  withQueryTimeout,
  shouldReconnect,
} from './db-error-handler';

// Re-export from error-handler (the existing comprehensive error handler)
export {
  // Error codes and types
  ErrorCode,
  type ApiError,
  type ApiResponse,
  ApiErrorException,
  isRetryableError,
  getUserFriendlyMessage,
  getRecoverySuggestions,
  type ErrorCategory,
  getHelpLinkForCategory,
  getErrorCategory,
  type RecoveryAction,
  type ErrorInfo,
  createErrorInfo,
  // Retry utilities
  type RetryConfig,
  withRetry,
  // WebSocket utilities
  type WebSocketReconnectConfig,
  ReconnectingWebSocket,
  // API utilities
  parseApiResponse,
  fetchWithRetry,
  // Connection status
  type ConnectionStatus,
  type ConnectionState,
  getConnectionStatusMessage,
  getConnectionStatusColor,
  // Error reporting
  createErrorReporter,
  // Specialized error classes
  FileOperationError,
  NetworkError,
  AuthError,
  TimeoutError,
  ServerError,
  // Global error system
  type ErrorEventListener,
  errorEvents,
  reportError,
  withErrorHandling,
  // Batch operations
  type FileOperationResult,
  type BatchOperationResult,
  createBatchOperationTracker,
} from './error-handler';
