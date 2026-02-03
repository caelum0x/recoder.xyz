/**
 * Services Index
 * Exports all advanced coding services
 */

// Project Templates
export {
  PROJECT_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplateById,
  getTemplatesByCategory,
  getPopularTemplates,
  getTemplatesByDifficulty,
  searchTemplates,
  filterTemplates,
  getAllTechnologies,
  getDifficultyColor,
  getCategoryInfo,
  initializeFromTemplate,
  getTemplateMetadata,
  validateTemplate,
  type ProjectTemplate,
  type TemplateCategory,
  type TemplateDifficulty,
  type TemplateIcon,
  type StarterFile,
  type TemplateCategory_ as TemplateCategoryInfo,
  type TemplateInitResult,
} from './project-templates';

// Code Context Awareness
export {
  extractImports,
  extractExports,
  detectLanguage,
  resolveImportPath,
  findRelatedFiles,
  loadProjectContext,
  parseFileReferences,
  generateContextPrompt,
  getSmartFileSelection,
  type FileContext,
  type ProjectContext,
  type RelatedFiles,
} from './code-context';

// Error Analyzer
export {
  parseError,
  parseErrors,
  generateFixPrompt,
  generateAutoFix,
  getCommonFixes,
  analyzeTerminalOutput,
  createDiagnosticReport,
  type ParsedError,
  type ErrorType,
} from './error-analyzer';

// Diff Preview
export {
  generateDiff,
  generateUnifiedDiff,
  parseUnifiedDiff,
  applySelectedHunks,
  addPendingChange,
  getPendingChanges,
  getPendingChangesForFile,
  acceptChange,
  rejectChange,
  acceptPartialChange,
  clearPendingChanges,
  clearPendingChangesForFile,
  formatDiffForDisplay,
  getDiffStats,
  hasSignificantChanges,
  generateInlineDiffHtml,
  type FileDiff,
  type DiffHunk,
  type DiffLine,
  type PendingChange,
} from './diff-preview';

// Undo Manager
export {
  saveState,
  saveBatchState,
  undo,
  redo,
  canUndo,
  canRedo,
  getCurrentState,
  getStateHistory,
  getActionHistory,
  getLastAIAction,
  undoLastAIAction,
  revertToState,
  revertToTimestamp,
  clearHistory,
  clearAllHistory,
  getStats as getUndoStats,
  exportState,
  importState,
  createUndoHooks,
  type FileState,
  type UndoStackEntry,
  type UndoAction,
} from './undo-manager';

// Code Validator
export {
  validateCode,
  formatValidationResult,
  canWriteWithValidation,
  applyQuickFix,
  validateRelativeImports,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type QuickFix,
} from './code-validator';

// Build Validator
export {
  validateBuild,
  validateBuildWithRecovery,
  classifyError,
  extractMissingPackages,
  extractImportsFromCode,
  calculateRetryDelay,
  getRecoveryAction,
  autoInstallPackages,
  restartDevServer,
  applyRecoveryAction,
  parseBuildOutput,
  formatBuildError,
  getErrorTypeDescription,
  type BuildValidation,
  type ErrorType as BuildErrorType,
  type RecoveryAction,
  type BuildError,
  type ValidationWithRecoveryOptions,
} from './build-validator';

// Edit Intent Analyzer
export {
  analyzeEditIntent,
  analyzeEditIntentAsync,
  formatIntentForDisplay,
  generateFocusedContext,
  getAffectedFilesPreview,
  EditType,
  type EditIntent,
  type ConfidenceLevel,
} from './edit-intent';

// Context Condensation
export {
  checkShouldCondense,
  condenseConversation,
  getEffectiveApiHistory,
  getMessagesSinceLastSummary,
  restoreCondensedMessages,
  estimateTokens,
  estimateMessageTokens,
  estimateConversationTokens,
  getContextWindow,
  getConversationStats,
  buildQuickSummary,
  N_MESSAGES_TO_KEEP,
  DEFAULT_THRESHOLD_PERCENT,
  MIN_MESSAGES_TO_CONDENSE,
  MODEL_CONTEXT_WINDOWS,
  type CondenseResult,
  type CondenseCheck,
  type CondensedMessage,
} from './condense';

// Feature Flags
export {
  FEATURE_FLAGS,
  DEFAULT_FLAG_CONFIGS,
  getCurrentEnvironment,
  getFeatureFlagState,
  getAllFeatureFlags,
  getFeatureFlagConfig,
  getAllFeatureFlagConfigs,
  getDeprecatedFlags,
  isFeatureEnabled,
  isUserInRollout,
  validateFeatureFlags,
  createFeatureFlagEvaluator,
  parseUrlOverrides,
  loadUserOverrides,
  saveUserOverrides,
  clearUserOverrides,
  // Simple convenience API (giselle-inspired)
  setFeatureFlag,
  getAllFlagsWithMetadata,
  resetFlagCache,
  type FeatureFlagName,
  type FeatureFlagConfig,
  type FeatureFlagDefinition,
  type FeatureFlagContext,
  type Environment,
} from './feature-flags';

// Checkpoint System
export {
  createCheckpoint,
  createAutoCheckpoint,
  loadCheckpoints,
  getCheckpoint,
  getCheckpointSummaries,
  deleteCheckpoint,
  pruneCheckpoints,
  clearCheckpoints,
  resumeFromCheckpoint,
  getCurrentCheckpointId,
  setCurrentCheckpointId,
  compareCheckpoints,
  compareToCurrentState,
  createBranch,
  getBranches,
  deleteBranch,
  addCheckpointTags,
  removeCheckpointTags,
  updateCheckpointDescription,
  getCheckpointsByTag,
  getLatestCheckpoint,
  getCheckpointTimeline,
  getCheckpointsStorageSize,
  formatStorageSize,
  exportCheckpoints,
  importCheckpoints,
  AUTO_CHECKPOINT_INTERVAL,
  type Checkpoint,
  type FileSnapshot,
  type CheckpointDiff,
  type CheckpointBranch,
  type CheckpointSummary,
} from './checkpoint';

// MCP (Model Context Protocol) Client
export {
  MCPClientManager,
  getMCPClientManager,
  initializeMCP,
  shutdownMCP,
  mcpToolToFunctionSchema,
  getMCPToolsAsSchema,
  getMCPToolsForPrompt,
  MCP_SERVER_PRESETS,
  createServerFromPreset,
  type MCPTransportType,
  type StdioTransportConfig,
  type SSETransportConfig,
  type StreamableHTTPConfig,
  type MCPTransportConfig,
  type MCPServerConfig,
  type MCPConnectionStatus,
  type MCPTool,
  type ToolCallRequest,
  type ToolCallResponse,
  type MCPServerState,
  type MCPClientEvent,
  type MCPEventListener,
} from './mcp-client';

// File Batcher
export {
  fileBatcher,
  queueFileWrite,
  queueFileWrites,
  flushFileWrites,
  configureFileBatcher,
  setFileBatcherProject,
  waitForBatchCompletion,
  clearPendingFiles,
  retryFailedFiles,
  getFileBatcherStats,
  batchStatus,
  batchProgress,
  pendingOperations,
  failedOperations,
  pendingCount,
  hasPendingOperations,
  type FileOperation,
  type FileOperationStatus,
  type BatchStatus,
  type BatchProgress,
  type BatchResult,
  type BatcherConfig,
} from './file-batcher';

// Batch File Reader
export {
  BatchFileReader,
  getBatchFileReader,
  readFilesBatch,
  readFilesWithProgress,
  getCachedFileContent,
  clearFileReadCache,
  invalidateFileCache,
  resetBatchReaderState,
  // Stores
  batchReadStatus,
  batchReadProgress,
  fileReadCache,
  isReading,
  // Types
  type FileReadResult,
  type BatchReadProgress,
  type BatchReadResult,
  type BatchReaderConfig,
  type BatchReadStatus,
} from './batch-file-reader';

// Workflow System
export {
  WorkflowExecutor,
  WorkflowBuilder,
  workflow,
  createChatStep,
  createConfirmationStep,
  createShellStep,
  createValidationStep,
  type ExecutionMode,
  type StepStatus,
  type WorkflowStatus,
  type StepContext,
  type StepResult,
  type StepExecutor,
  type StepCondition,
  type WorkflowStep,
  type StepState,
  type WorkflowDefinition,
  type WorkflowState,
  type WorkflowEvents,
} from './workflow';

// Prompt Optimizer (Client-side)
export {
  // Stores
  optimizerStore,
  cacheStore,
  performanceStore,
  configStore,
  isLoading,
  error,
  cacheSize,
  cacheHitRate,
  // Constants
  DEFAULT_PRACTICES,
  ALL_PRACTICES,
  PRACTICE_DESCRIPTIONS,
  // Cache functions
  loadCache,
  getCachedPrompt,
  cachePrompt,
  clearCache,
  getCacheStats,
  // Performance tracking
  loadPerformanceMetrics,
  trackPromptUsage,
  ratePrompt,
  getPromptRating,
  getTopPrompts,
  clearPerformanceMetrics,
  // Optimization functions
  optimizePrompt,
  optimizePromptLocal,
  // Config functions
  updateConfig,
  resetConfig,
  togglePractice,
  setAllPractices,
  clearAllPractices,
  // Utilities
  initializePromptOptimizer,
  getOptimizationPreview,
  exportOptimizerData,
  importOptimizerData,
  // Types
  type BestPractice,
  type PromptOptimizerConfig,
  type CachedPrompt,
  type PromptPerformance,
  type OptimizationResult,
} from './prompt-optimizer';

// Model Comparison
export {
  // Model information
  getAvailableModels,
  getModelsByProvider,
  getModelInfo,
  getProviderDisplayName,
  // Comparison execution
  createComparisonResult,
  updateModelResponse,
  finalizeModelResponse,
  failModelResponse,
  finalizeComparison,
  // Export/Import
  exportComparisonResult,
  exportComparisonToCSV,
  importComparisonResult,
  // Utilities
  formatDuration,
  formatCost,
  formatTokens,
  getComparisonSummary,
  getTotalCost,
  getAverageResponseTime,
  // Constants
  DEFAULT_COMPARISON_OPTIONS,
  POPULAR_COMPARISON_MODELS,
  // Types
  type ComparisonMetrics,
  type QualityScore,
  type ModelResponse,
  type ComparisonResult,
  type ComparisonOptions,
} from './model-comparison';

// AI Evaluation Framework
export {
  // Core evaluation functions
  evaluateCode,
  evaluateTestCase,
  runEvaluationDataset,
  // Comparison & reporting
  compareRuns,
  generateReport,
  formatReport,
  // Dataset helpers
  createDataset,
  createTestCase,
  createCustomEvaluator,
  // Built-in datasets
  REACT_COMPONENT_DATASET,
  TYPESCRIPT_UTILS_DATASET,
  // Constants
  DEFAULT_METRIC_WEIGHTS,
  DEFAULT_PASS_THRESHOLD,
  DEFAULT_TIMEOUT,
  // Types
  type Score,
  type MetricName,
  type MetricResult,
  type EvaluationResult,
  type TestCase,
  type TestDataset,
  type CustomValidator,
  type CustomValidatorResult,
  type EvaluationOptions,
  type CustomEvaluator,
  type EvaluationRun,
  type EvaluationSummary,
  type EvaluationComparison,
  type EvaluationReport,
} from './evaluation';

// Attachments Service
export {
  // Constants
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  MAX_IMAGE_DIMENSION,
  SUPPORTED_IMAGE_TYPES,
  SUPPORTED_DOCUMENT_TYPES,
  SUPPORTED_EXTENSIONS,
  // Functions
  getAttachmentType,
  isFileTypeSupported,
  validateFiles,
  fileToBase64,
  generateImagePreview,
  extractTextContent,
  processFile,
  processFiles,
  formatAttachmentForAPI,
  formatAttachmentsForAPI,
  formatFileSize,
  getAttachmentsSummary,
  cleanupAttachment,
  cleanupAttachments,
  // Types
  type AttachmentType,
  type ProcessedAttachment,
  type AttachmentError,
  type ProcessingResult,
  type ValidationResult as AttachmentValidationResult,
} from './attachments';

// Context Filter (Smart File Filtering)
export {
  // Core filtering
  filterFileTree,
  filterForAIContext,
  flattenFileTree,
  // Formatting
  formatFilesForContext,
  getFilterSummary,
  createCompactFileTree,
  // Utilities
  estimateTokenCount,
  detectLanguage as detectFileLanguage,
  shouldExcludeDirectory,
  shouldExcludeFile,
  getFilePriority,
  isBinaryContent,
  // Settings access
  getContextSettings,
  updateContextSettings,
  resetContextSettings,
  // Constants
  DEFAULT_EXCLUDED_DIRS,
  DEFAULT_EXCLUDED_FILE_PATTERNS,
  PRIORITY_FILES,
  // Types
  type FileItem as ContextFileItem,
  type FilteredFile,
  type FilterResult,
} from './context-filter';

// Action Parser (XML Tag Parsing for AI Responses)
export {
  // Core parsing - Actions
  parseActions,
  hasActionTags,
  stripActionTags,
  // Action helpers
  getActionsByType,
  getAffectedPaths,
  // Validation
  validateAction,
  validateAllActions,
  // Display
  createActionSummary,
  // Core parsing - Message Blocks
  parseMessageBlocks,
  hasMessageBlockTags,
  stripMessageBlockTags,
  getBlocksByType,
  // Combined parsing
  hasAnySpecialTags,
  parseAllTags,
  // Types - Actions
  type ActionType,
  type BaseAction,
  type WriteAction,
  type RenameAction,
  type DeleteAction,
  type ShellAction,
  type DependencyAction,
  type ParsedAction,
  type ParseResult,
  // Types - Message Blocks
  type MessageBlockType,
  type MessageBlock,
  type MessageBlockParseResult,
} from './action-parser';

// Command Registry
export {
  // Singleton instance
  commandRegistry,
  // Registration
  registerCommand,
  registerCommands,
  unregisterCommand,
  // Retrieval
  getAllCommands as getRegistryCommands,
  getRecentCommands as getRegistryRecentCommands,
  getCommandsByCategory as getRegistryCategoryCommands,
  searchCommands as searchRegistryCommands,
  // Execution
  executeCommand as executeRegistryCommand,
  // Factory
  createDefaultCommands,
  // Metadata
  CATEGORY_METADATA,
  // Types
  type Command,
  type CommandCategory as RegistryCommandCategory,
  type CommandShortcut,
  type CommandRegistryState,
} from './command-registry';

// Keyboard Shortcuts Manager
export {
  // Core functions
  initKeyboardShortcuts,
  registerShortcut,
  registerShortcuts,
  unregisterShortcut,
  executeShortcut,
  // Query functions
  getRegisteredShortcuts,
  getShortcutsByCategory as getServiceShortcutsByCategory,
  getShortcutsForContext,
  getShortcut,
  getActiveCategories,
  // Context management
  setActiveContext,
  getActiveContext,
  // Shortcut control
  enableShortcut,
  disableShortcut,
  checkConflicts,
  // Utilities
  keyComboToString,
  parseKeyComboString,
  formatBindingForDisplay,
  isShortcutsInitialized,
  // Types
  type KeyCombo,
  type ShortcutHandler,
  type ShortcutCategory,
} from './keyboard-shortcuts';

// Response Quality
export {
  // Core evaluation
  evaluateResponse,
  quickQualityCheck,
  // Display utilities
  getScoreColor,
  getScoreBgColor,
  getGradeColor,
  formatQualityResult,
  // Configuration
  DEFAULT_CONFIG as DEFAULT_QUALITY_CONFIG,
  // Types
  type QualityDimension,
  type DimensionScore,
  type QualityScores,
  type QualityIssue,
  type QualityResult,
  type QualityConfig,
} from './response-quality';

// Project Settings
export {
  // Storage functions
  loadProjectSettings,
  saveProjectSettings,
  deleteProjectSettings,
  hasProjectSettings,
  getAllProjectSettingsIds,
  // Validation
  validateSettings,
  // Utilities
  createDefaultSettings,
  resetCategoryToDefaults,
  exportSettings,
  importSettings,
  // Constants
  CURRENT_SETTINGS_VERSION,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_PREVIEW_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
  AVAILABLE_MODELS,
  AVAILABLE_FRAMEWORKS,
  AVAILABLE_LANGUAGES,
  AVAILABLE_SHELLS,
  DEVICE_PRESETS,
  // Types
  type SettingsCategory,
  type GeneralSettings,
  type AISettings,
  type EditorSettings,
  type PreviewSettings,
  type TerminalSettings,
  type ProjectSettings,
  type ValidationError as SettingsValidationError,
  type ValidationResult as SettingsValidationResult,
} from './project-settings';


// File Search Executor (Agentic Search)
export {
  // Core execution
  executeSearchPlan,
  // Formatting
  formatSearchResultsForAI,
  // Target selection
  selectTargetFile,
  // Search plan helpers
  createSearchPlan,
  // Specialized searches
  searchForDefinition,
  searchForUsages,
  searchForImports,
  // Utilities
  getSearchSummary,
  // Types
  type SearchResult,
  type SearchPlan,
  type SearchExecutionResult,
} from './file-search-executor';

// Package Detector (Auto-detect npm packages from imports)
export {
  // Constants
  NODE_BUILTINS,
  COMMON_ALIASES,
  // Detection functions
  extractImportsFromContent,
  extractPackageName,
  detectPackages,
  detectMissingPackages,
  // Filtering functions
  filterInstalledPackages,
  parsePackageJson,
  // Utility functions
  isLocalImport,
  isBuiltinModule,
  isAliasImport,
  shouldScanFile,
  // Command generation
  generateInstallCommand,
  detectPackageManager,
  // Types
  type PackageDetectionResult,
  type PackageDetectionOptions,
} from './package-detector';

// Morph Fast Apply (Ultra-fast targeted code edits)
export {
  // Core functions
  applyMorphEditToFile,
  applyMorphEdits,
  applyMorphEditsFromText,
  // Parsing functions
  parseMorphEdits,
  hasEditBlocks,
  stripEditBlocks,
  // Path utilities
  normalizeProjectPath,
  // Stores (nanostores)
  morphStatus,
  morphProgress,
  morphError,
  morphStats,
  // Utility functions
  clearFileCache,
  clearProjectCache,
  invalidateFile,
  getMorphStats,
  resetMorphStats,
  isMorphConfigured,
  validateMorphApiKey,
  // Types
  type MorphEditBlock,
  type MorphApplyResult,
  type MorphBatchResult,
  type MorphConfig,
  type MorphStatus,
} from './morph-fast-apply';

// Context Selector (Intelligent file selection for AI context)
export {
  // Core selection functions
  selectFilesForEdit,
  selectFilesForEditAsync,
  // File content functions
  getFileContents,
  formatFilesForAI,
  buildCompleteContext,
  // Utility functions
  estimateTokens as estimateContextTokens,
  prioritizeFiles,
  getKeyFiles,
  // Types
  type FileSelectionContext,
  type ComponentInfo,
  type FileManifest,
  type RouteInfo,
} from './context-selector';

// File Parser (JS/TS/JSX/TSX file analysis)
export {
  // Import extraction
  extractImports as extractFileImports,
  // Export extraction
  extractExports as extractFileExports,
  // Component extraction
  extractComponentInfo,
  // File type detection
  determineFileType,
  // Main parsing
  parseFile,
  parseFiles,
  // Component tree
  buildComponentTree,
  // Utility functions
  getLocalImports,
  getExternalImports,
  isReactComponent,
  getFilesImporting,
  getFilesImportedBy,
  summarizeFileInfo,
  // Types
  type ImportInfo,
  type ComponentInfo as ParsedComponentInfo,
  type FileType,
  type FileInfo,
  type ComponentTreeNode,
} from './file-parser';

// AI Provider Manager (Multi-provider support)
export {
  // API Key management
  setApiKey,
  getApiKey,
  hasApiKey,
  clearApiKey,
  // Provider resolution
  getProviderForModel,
  getActualModelId,
  resolveProvider,
  // Provider configuration
  getProviderConfig,
  getAvailableProviders,
  // Health checking
  checkProviderHealth,
  checkAllProvidersHealth,
  getProviderHealthStatus,
  isProviderHealthy,
  // Model information
  getModelInfo as getAIModelInfo,
  getAllModels,
  getModelsForProvider,
  registerModel,
  getModelsWithFeature,
  // Utilities
  estimateCost,
  getBestAvailableModel,
  getProviderDisplayName as getAIProviderDisplayName,
  validateApiKeyFormat,
  initializeFromEnvironment,
  getProviderSummary,
  // Stores
  primaryProvider,
  providerHealth,
  // Types
  type ProviderName,
  type ProviderConfig,
  type ProviderResolution,
  type ProviderHealth,
  type ModelInfo,
  type ProviderManagerState,
} from './ai-provider-manager';

// Streaming XML Parser (Real-time AI Response Parsing)
export {
  // Core parser class
  StreamingXMLParser,
  // Stream parsing
  streamParsePlan,
  // Synchronous parsing
  parsePlanSync,
  // Utility functions
  getPackagesToInstall,
  getAffectedFilePaths,
  hasFileChanges,
  hasCommands,
  createSimpleDiff,
  formatPlanSummary,
  // Stream consumer
  consumeStreamWithHandlers,
  // Recoder-specific
  createRecoderParser,
  // Types - Tags
  type TagType,
  type TagCallbackType,
  type StreamingCallbackType,
  // Types - Chunks
  type ThinkingChunkType,
  type DescriptionChunkType,
  type ActionChunkType,
  type FileActionData,
  type CommandActionData,
  type DeleteActionData,
  type ErrorChunkType,
  type StreamChunk,
  // Types - Plan
  type FileAction as StreamingFileAction,
  type DeleteFileAction as StreamingDeleteFileAction,
  type NpmInstallCommand as StreamingNpmInstallCommand,
  type ShellCommand as StreamingShellCommand,
  type PlanAction as StreamingPlanAction,
  type Plan as StreamingPlan,
  // Types - Options
  type StreamingXMLParserOptions,
  type StreamParseOptions,
  type StreamEventHandlers,
} from './streaming-xml-parser';

// Auto-Approval System
export {
  // Main approval check
  checkAutoApproval,
  // Command approval
  getCommandDecision,
  getSingleCommandDecision,
  parseCommand,
  containsDangerousSubstitution,
  findLongestPrefixMatch,
  // Path checks
  isProtectedPath,
  isOutsideWorkspace,
  // Action type checks
  isReadOnlyAction,
  isWriteAction,
  isShellAction,
  // Request/cost tracking
  trackRequest,
  resetRequestTracking,
  getTrackingState,
  // Configuration functions
  updateAutoApprovalFlags,
  enableYoloMode,
  disableYoloMode,
  toggleYoloMode,
  enableAutoApproval,
  disableAutoApproval,
  toggleAutoApproval,
  addAllowedCommand,
  removeAllowedCommand,
  addDeniedCommand,
  removeDeniedCommand,
  updateProtectedPaths,
  addProtectedPattern,
  removeProtectedPattern,
  resetToDefaults,
  // Panel functions
  openAutoApprovalPanel,
  closeAutoApprovalPanel,
  toggleAutoApprovalPanel,
  // Export/Import
  exportConfig as exportAutoApprovalConfig,
  importConfig as importAutoApprovalConfig,
  // Handler class
  AutoApprovalHandler,
  autoApprovalHandler,
  // Stores
  autoApprovalStore,
  protectedPathsStore,
  requestTrackingStore,
  autoApprovalPanelOpen,
  // Constants
  DEFAULT_AUTO_APPROVAL_FLAGS,
  DEFAULT_PROTECTED_PATHS,
  // Types
  type ApprovalDecision,
  type CommandDecision,
  type TimeoutApproval,
  type ApprovalResult,
  type ApprovalResponse,
  type AutoApprovalFlags,
  type ProtectedPathConfig,
  type RequestTrackingState,
  type ApprovalCheckParams,
} from './auto-approval';

// Operations System (Provider-based architecture)
export * as operations from './operations';
export {
  // Core Execution
  executeGeneration,
  executeWithProvider,
  executeAction,
  executeDataQuery,
  executeQuery,
  // Provider Registry
  providerRegistry,
  registerActionProvider,
  registerQueryProvider,
  registerDataProvider,
  getProvidersForNodeType,
  initializeProviders,
  checkProvidersHealth,
  // Generation Management
  getGeneration,
  setGeneration,
  createQueuedGeneration,
  queueGeneration,
  useGenerationExecutor,
  // Action Registry
  registerAction,
  getAction,
  getAllActions,
  getActionsByProvider,
  // Data Store Registry
  registerDataStore,
  getDataStore as getOperationsDataStore,
  removeDataStore,
  getAllDataStores,
  // Query Service Registry
  registerQueryService,
  getQueryService,
  getAllQueryServices,
  // Query Executor
  registerQueryExecutor,
  getQueryExecutor,
  // Utilities
  formatQueryResult as formatDataQueryResult,
  queryResultToCsv,
  queryResultToJson,
  formatQueryResults,
  getTopResults,
  filterByScore,
  mergeResults,
  // Constants
  DEFAULT_MAX_RESULTS,
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_EMBEDDING_PROFILE_ID,
  // Types
  type NodeId,
  type OutputId,
  type ActionId,
  type QueryId,
  type GenerationId,
  type TaskId,
  type Generation,
  type QueuedGeneration,
  type RunningGeneration,
  type CompletedGeneration,
  type FailedGeneration,
  type GenerationContext,
  type GenerationOutput,
  type ExecutionContext,
  type ActionHandler,
  type DataStoreConfig,
  type QueryExecutor as OperationsQueryExecutor,
  type VectorStoreQueryService,
  type ActionProviderDefinition,
  type QueryProviderDefinition,
  type DataProviderDefinition,
  type ProviderHealth as OperationsProviderHealth,
  ActionExecutionError,
  QueryExecutionError,
  DataQueryError,
} from './operations';

// Dispatcher Service (Multi-tenant request routing)
// Re-export under 'dispatcher' namespace to avoid name conflicts
export * as dispatcher from './dispatcher';

// Builder Service (Vite-based build system)
export {
  // Core build service
  BuildService,
  createBuildService,
  getBuildService,
  executeBuild,
  executeBuildWithProgress,
  validateBuildConfig,
  validateBuildOutput,
  cleanBuildArtifacts,
  // State stores
  buildStatus,
  buildProgress,
  buildErrors,
  buildResult,
  isBuildInProgress,
  // Vite configuration
  createViteConfig,
  getDefaultViteConfig,
  mergeViteConfigs,
  validateViteConfig,
  getVitePlugins,
  // Worker compilation
  compileWorker,
  compileWorkerFromSource,
  bundleWorkerCode,
  validateWorkerCode,
  getWorkerTemplate,
  createHonoWorker,
  // Asset bundling
  bundleAssets,
  optimizeAssets,
  hashAssets,
  generateManifest,
  getAssetStats,
  compressAssets,
  // Build presets
  BUILD_PRESETS,
  getPresetConfig,
  getPresetForFramework,
  listAvailablePresets,
  // Types
  type BuildResult,
  type BuildProgress,
  type BuildConfig,
  type BuildStatus,
  type BuildError as BuildServiceError,
  type BuildArtifact,
  type ViteConfig,
  type VitePluginConfig,
  type ViteServerConfig,
  type ViteBuildConfig,
  type ViteResolveConfig,
  type WorkerCompilationResult,
  type WorkerConfig,
  type WorkerTemplate,
  type AssetBundle,
  type AssetManifest,
  type AssetStats,
  type AssetOptimizationOptions,
  type BuildPreset,
  type PresetName,
} from './builder';

// AI Generation System (Libra-based)
// Unified AI generation with multi-provider support
export * as ai from './ai';
export {
  // Core generation
  generateStreamResponse,
  streamGenerateApp,
  streamGenerateAppForFileEdit,
  generateComplete,
  consumeStreamWithHandlers as consumeAIStreamWithHandlers,
  asyncIterableToStream,
  collectStream,

  // Context building
  buildGenerationContext,
  buildFileMapWithHistory,
  parseMessageHistory,
  buildFilesToXml,
  buildSingleFileXml,
  buildFileMap as buildAIFileMap,
  buildFileTree as buildAIFileTree,
  buildMinimalContext,
  buildFocusedContext,

  // Models
  AI_MODELS,
  getModelById as getAIModelById,
  getModelsByProvider as getAIModelsByProvider,
  selectModel as selectAIModel,
  getBestModelForTask,
  getPopularModels,
  estimateCost as estimateAICost,

  // Providers
  PROVIDERS as AI_PROVIDERS,
  getProviderFromModelId,
  getActualModelId as getActualAIModelId,
  checkProviderHealth as checkAIProviderHealth,
  getAvailableProviders as getAvailableAIProviders,
  validateApiKeyFormat as validateAIApiKeyFormat,

  // Prompts
  getSystemPrompt as getAISystemPrompt,
  getEnhancedSystemPrompt as getAIEnhancedSystemPrompt,
  getSystemPromptForMode,

  // Utilities
  buildUserPrompt,
  buildSelectedElementsInfo,
  estimateTokens as estimateAITokens,
  estimateContextSize,
  contextFitsModel,

  // Types (re-export with AI prefix to avoid conflicts)
  type ImageData as AIImageData,
  type GenerationConfig as AIGenerationConfig,
  type GenerationContext as AIGenerationContext,
  type ProjectData as AIProjectData,
  type FileInfo as AIFileInfo,
  type StreamEventHandlers as AIStreamEventHandlers,
  type AIModel,
  type AIProvider,
  type Plan as AIPlan,
  type PlanAction as AIPlanAction,
  type FileAction as AIFileAction,
} from './ai';

// Deploy Workflow Service
export * as deployWorkflow from './deploy-workflow';
export {
  // Service factory
  createDeploymentService,
  // Types
  DeploymentStatus,
  type DeploymentParams,
  type DeploymentContext,
  type DeploymentEnvironment,
  type DeploymentState as WorkflowDeploymentState,
  type DeploymentResult,
  type DeploymentRequest,
  type DeploymentResponse,
  type DeploymentStatusResponse,
  type QueueMessage,
  type QueueBatchResult,
  // Workflow
  DeploymentWorkflow,
  createDeploymentWorkflow,
  executeDeployment,
  // State management
  DeploymentStateManager,
  createStateManager,
  // Queue
  enqueueDeployment,
  processBatch,
  startConsumer,
  getQueueStats,
  // Steps
  validateAndPrepare,
  createSandbox,
  syncFiles,
  buildProject,
  deployToCloudflare,
  updateDatabaseAndCleanup,
  // Utilities
  generateDeploymentId as generateDeployId,
  DEPLOYMENT_CONFIG,
  DeploymentError,
} from './deploy-workflow';

// Proposals System (Dyad)
export {
  // Schemas
  SecurityRiskSchema,
  FileChangeSchema,
  SqlQuerySchema,
  CodeProposalSchema,
  ActionProposalSchema,
  TipProposalSchema,
  ProposalSchema,
  ProposalResultSchema,
  ApproveProposalResultSchema,
  // Types
  type SecurityRisk,
  type FileChange,
  type SqlQuery,
  type CodeProposal,
  type SuggestedAction,
  type ActionProposal,
  type TipProposal,
  type Proposal,
  type ProposalResult,
  type ApproveProposalResult,
  // State
  proposalsStore,
  activeProposalId,
  isProcessingProposal,
  // Helpers
  createProposalId,
  createCodeProposal,
  createActionProposal,
  createTipProposal,
  createProposalResult,
  // Actions
  addProposal,
  getProposal,
  getActiveProposal,
  getPendingProposals,
  updateProposalStatus,
  approveProposal,
  rejectProposal,
  clearProjectProposals,
  expireOldProposals,
  // Security
  analyzeSecurityRisks,
  getRiskColor,
  getRiskIcon,
  // Action helpers
  getActionDisplayText,
  getActionIcon,
  // Type guards
  isCodeProposal,
  isActionProposal,
  isTipProposal,
} from './proposals';

// MCP Management (Dyad/Kilocode)
export {
  // Schemas
  McpTransportTypeSchema,
  McpServerConfigSchema,
  McpToolSchema,
  McpResourceSchema,
  McpPromptSchema,
  McpServerStatusSchema,
  McpServerStateSchema,
  McpConsentSchema,
  McpToolCallSchema,
  // Types
  type McpTransportType,
  type McpServerConfig,
  type McpTool,
  type McpToolParameter,
  type McpResource,
  type McpPrompt,
  type McpServerStatus,
  type McpServerState,
  type McpConsent,
  type McpToolCall,
  // State
  mcpServersStore,
  mcpConsentsStore,
  mcpToolCallsStore,
  pendingConsentRequest,
  // Computed
  allMcpTools,
  allMcpResources,
  allMcpPrompts,
  connectedServers,
  // Server management
  createMcpServerId,
  registerMcpServer,
  updateMcpServerStatus,
  updateMcpServerTools,
  updateMcpServerResources,
  updateMcpServerPrompts,
  removeMcpServer,
  getMcpServer,
  getAllMcpServers,
  // Tool discovery
  findMcpTool,
  searchMcpTools,
  getServerTools,
  // Consent
  grantMcpConsent,
  revokeMcpConsent,
  hasMcpConsent,
  getMcpConsent,
  requestMcpConsent,
  denyPendingConsent,
  // Tool execution
  createToolCallId,
  startToolCall,
  markToolCallRunning,
  completeToolCall,
  failToolCall,
  getToolCall,
  // Built-in servers
  BUILT_IN_MCP_SERVERS,
  initializeBuiltInServers,
  // UI helpers
  getServerStatusColor,
  getServerStatusIcon,
  getServerStatusLabel,
  formatToolParameters,
} from './mcp';

// Context Management (Kilocode)
export {
  // Constants
  TOKEN_BUFFER_PERCENTAGE,
  DEFAULT_MAX_TOKENS,
  CONDENSATION_TRIGGER_PERCENTAGE,
  SUMMARY_MAX_TOKENS,
  // Schemas
  MessageRoleSchema,
  ConversationMessageSchema,
  ContextStateSchema,
  FileContextSchema,
  ContextConfigSchema,
  // Types
  type MessageRole,
  type ConversationMessage,
  type ContextState,
  type FileContext as ContextFileContext,
  type ContextConfig,
  // State
  contextConfigStore,
  conversationMessagesStore,
  fileContextStore,
  totalTokensStore,
  isCondensing,
  // Computed
  tokenUsagePercentage,
  availableTokens,
  needsCondensation,
  sortedMessages,
  // Token estimation
  estimateTokenCount as estimateContextTokenCount,
  estimateMessageTokens as estimateContextMessageTokens,
  // Message management
  createMessageId,
  addMessage,
  updateMessage,
  removeMessage,
  getMessages,
  getVisibleMessages,
  // Truncation
  truncateConversation,
  restoreTruncation,
  // Condensation
  generateCondensationPrompt,
  applyCondensation,
  getMessagesToCondense,
  // File context
  setFileContext,
  markFileContextStale,
  removeFileContext,
  getFileContexts,
  getStaleFileContexts,
  // Reset
  clearContext,
  resetContext,
  // Stats
  getContextStats,
  formatContextStats,
} from './context-management';

// Tools Framework (Kilocode)
export {
  // Tool names
  ToolNameSchema,
  // Parameter schemas
  ReadFileParamsSchema,
  WriteFileParamsSchema,
  EditFileParamsSchema,
  DeleteFileParamsSchema,
  ListFilesParamsSchema,
  SearchFilesParamsSchema,
  ApplyDiffParamsSchema,
  MultiApplyDiffParamsSchema,
  SearchReplaceParamsSchema,
  ExecuteCommandParamsSchema,
  BrowserActionParamsSchema,
  NewTaskParamsSchema,
  AttemptCompletionParamsSchema,
  UpdateTodoParamsSchema,
  UseMcpToolParamsSchema,
  AccessMcpResourceParamsSchema,
  ToolParamsSchemas,
  // Types
  type ToolName,
  type ToolParams,
  type ToolUse,
  type ToolResult,
  type ToolCallbacks,
  type ToolDefinition,
  type ToolExecutionStatus,
  type ToolExecution,
  // State
  toolExecutionsStore,
  pendingApproval as pendingToolApproval,
  consecutiveMistakes,
  toolErrors,
  // Definitions
  TOOL_DEFINITIONS,
  // Validation
  validateToolUse,
  requiresApproval as toolRequiresApproval,
  // Execution
  createToolExecutionId,
  startToolExecution,
  grantApproval as grantToolApproval,
  denyApproval as denyToolApproval,
  completeToolExecution,
  getToolExecution,
  getPendingExecutions,
  // Repetition detection
  detectRepetition,
  clearRepetitionTracking,
  // Parsing
  parseXmlToolCalls,
  removeClosingTag,
  // Native format
  toNativeToolFormat,
  getAllNativeTools,
} from './tools';

// Checkpoints (Kilocode)
export * as checkpointsService from './checkpoints';

// Diff Strategies (Kilocode)
export {
  // Constants
  BUFFER_LINES,
  DEFAULT_FUZZY_THRESHOLD,
  MAX_SEARCH_ATTEMPTS,
  // Schemas
  DiffStrategyTypeSchema,
  DiffBlockSchema,
  DiffResultSchema,
  MultiDiffResultSchema,
  // Types
  type DiffStrategyType,
  type DiffBlock,
  type DiffResult,
  type MultiDiffResult,
  // State
  currentStrategy,
  fuzzyThreshold,
  // String utilities
  normalizeString,
  levenshteinDistance,
  stringSimilarity,
  // Search/Replace
  applySearchReplace,
  parseDiffBlocks,
  applyMultiSearchReplace,
  // Unified diff
  parseUnifiedDiff as parseDiffUnified,
  applyUnifiedDiff,
  // Line replace
  applyLineReplace,
  // Auto-detection
  applyDiff,
  detectDiffStrategy,
  // Validation
  validateDiff,
  previewDiff,
} from './diff-strategies';

// AI Providers (Kilocode)
export {
  // Provider types
  AIProviderTypeSchema,
  type AIProviderType,
  // Model schemas
  ModelCapabilitiesSchema,
  ModelInfoSchema,
  ProviderConfigSchema,
  // Message schemas
  ContentPartSchema,
  ChatMessageSchema,
  CreateMessageParamsSchema,
  CreateMessageMetadataSchema,
  // Response schemas
  StreamEventTypeSchema,
  StreamEventSchema,
  MessageResponseSchema,
  // Types
  type ModelCapabilities,
  type ModelInfo as AIModelInfo,
  type ProviderConfig as AIProviderConfig,
  type ContentPart,
  type ChatMessage,
  type CreateMessageParams,
  type CreateMessageMetadata,
  type StreamEventType,
  type StreamEvent,
  type MessageResponse,
  // State
  providersStore,
  modelsStore,
  activeProviderId as activeAIProviderId,
  activeModelId,
  isStreaming,
  lastError as lastAIError,
  // Computed
  activeProvider,
  activeModel,
  enabledProviders,
  availableModels,
  // Provider config
  configureProvider,
  removeProvider,
  setActiveProvider,
  getProviderConfig as getAIProviderConfig,
  // Model management
  registerModel as registerAIModel,
  removeModel,
  setActiveModel,
  getProviderModels,
  // Token estimation
  estimateTokens as estimateAITokens2,
  estimateMessageTokens as estimateAIMessageTokens,
  estimateTotalTokens,
  // Cost estimation
  estimateCost as estimateAICost2,
  formatCost as formatAICost,
  // Default models
  DEFAULT_MODELS,
  initializeDefaultModels,
  // Base URLs
  PROVIDER_BASE_URLS,
  getProviderBaseUrl,
  // Usage tracking
  trackUsage,
  getUsageSummary,
  getTotalUsage,
} from './ai-providers';

// Browser Automation (Kilocode)
export {
  // Schemas
  BrowserActionTypeSchema,
  BrowserStateSchema,
  ElementSelectorSchema,
  BrowserActionSchema,
  BrowserActionResultSchema,
  PageInfoSchema,
  BrowserSessionSchema,
  BrowserConfigSchema,
  // Types
  type BrowserActionType,
  type BrowserState,
  type ElementSelector,
  type BrowserAction,
  type BrowserActionResult,
  type PageInfo,
  type BrowserSession,
  type BrowserConfig,
  // State
  browserSessionsStore,
  activeBrowserSessionId,
  browserConfig,
  // Session management
  createBrowserSessionId,
  createBrowserSession,
  updateBrowserSessionState,
  updateBrowserSessionPageInfo,
  addBrowserScreenshot,
  getBrowserSession,
  getActiveBrowserSession,
  closeBrowserSession,
  removeBrowserSession,
  // Action helpers
  createActionResult,
  parseSelector,
  formatSelector,
  // Content extraction
  extractTextContent as extractBrowserTextContent,
  extractLinks,
  extractImages,
  extractMetadata,
  // Validation
  validateBrowserAction,
  // Description
  describeBrowserAction,
  // UI helpers
  getBrowserStateColor,
  getBrowserStateIcon,
  getBrowserActionIcon,
} from './browser-automation';

// Assistant Parser (Kilocode)
export {
  // Schemas
  ParsedBlockTypeSchema,
  ParsedBlockSchema,
  ThinkingBlockSchema,
  ToolUseBlockSchema,
  CodeBlockSchema,
  ArtifactBlockSchema,
  ParsedMessageSchema,
  // Types
  type ParsedBlockType,
  type ParsedBlock,
  type ThinkingBlock,
  type ToolUseBlock,
  type CodeBlock,
  type ArtifactBlock,
  type ParsedMessage,
  // State
  isParsing,
  parseError as assistantParseError,
  // XML tool parsing
  parseXmlToolCalls as parseAssistantXmlToolCalls,
  // Thinking blocks
  parseThinkingBlocks,
  // Code blocks
  parseCodeBlocks,
  // Artifacts
  parseArtifacts,
  // Main parser
  parseAssistantMessage,
  // Streaming parser
  createStreamingParser,
  // Helpers
  extractFirstToolCall,
  hasToolCalls,
  hasThinkingBlocks,
  stripToolCalls,
  stripThinkingBlocks,
  getDisplayContent,
  // Native tool calls
  parseNativeToolCalls,
  toolCallToXml,
} from './assistant-parser';
