/**
 * Ollama Integration Module
 * 
 * Complete Ollama integration for recoder.xyz CLI with auto-installation,
 * health monitoring, model management, and AI provider capabilities.
 * 
 * @example
 * ```typescript
 * import { ollamaService } from '@/services/ollama';
 * 
 * // Initialize service
 * await ollamaService.initialize();
 * 
 * // Check if ready
 * if (await ollamaService.isReady()) {
 *   const response = await ollamaService.complete('Write a hello world in Python');
 *   console.log(response);
 * }
 * ```
 */

// Main service orchestrator
export { ollamaService, OllamaService } from './ollama-service';
export type { 
  OllamaServiceConfig, 
  ServiceStatus, 
  OllamaServiceEvents 
} from './ollama-service';

// Installation system
export { ollamaInstaller, OllamaInstaller } from './installer';
export type { 
  InstallationProgress, 
  OllamaInstallation, 
  InstallationOptions, 
  InstallationResult 
} from './installer';

// Health monitoring
export { healthChecker, OllamaHealthChecker } from './health-checker';
export type { 
  HealthStatus, 
  ServiceConfig, 
  ProcessInfo 
} from './health-checker';

// Model management
export { modelManager, OllamaModelManager } from './model-manager';
export type {
  ModelInfo,
  ModelCapability,
  ModelRequirements,
  ModelRecommendation,
  DownloadProgress,
  SystemProfile
} from './model-manager';

// Platform detection
export { platformDetector, PlatformDetector } from './platform-detector';
export type {
  PlatformInfo,
  BinaryInfo,
  SystemRequirements,
  InstallationPaths
} from './platform-detector';

// Download management
export { downloadManager, DownloadManager } from './download-manager';
export type {
  DownloadOptions,
  DownloadProgress as DownloadManagerProgress,
  DownloadSession
} from './download-manager';

// Recommendation engine
export { recommendationEngine, IntelligentRecommendationEngine } from './recommendation-engine';
export type {
  RecommendationContext,
  UserPreferences,
  UsagePattern,
  ModelRecommendation as IntelligentModelRecommendation,
  RecommendationReason,
  ProjectAnalysis as RecommendationProjectAnalysis
} from './recommendation-engine';

// Project analyzer
export { projectAnalyzer, ProjectAnalyzer } from './project-analyzer';
export type {
  FileAnalysis,
  LanguageStats,
  FrameworkDetection,
  ProjectComplexity,
  AIUsagePattern,
  ProjectAnalysis
} from './project-analyzer';

// Background update manager
export { updateManager, BackgroundUpdateManager } from './update-manager';
export type {
  UpdateSchedule,
  ModelUpdate,
  UpdateSession,
  UpdatePolicy
} from './update-manager';

// Enhanced Ollama provider
export { enhancedOllamaProvider, EnhancedOllamaProvider } from './enhanced-ollama-provider';
export type {
  EnhancedCompletionOptions,
  EnhancedCompletionResponse,
  ChatMessage,
  CodeGenerationRequest,
  CodeGenerationResponse
} from './enhanced-ollama-provider';

// Performance optimizer
export { performanceOptimizer, PerformanceOptimizer } from './performance-optimizer';
export type {
  PerformanceMetrics,
  OptimizationConfig,
  OptimizationResult
} from './performance-optimizer';

// Offline manager
export { offlineManager, OfflineManager } from './offline-manager';
export type {
  NetworkStatus,
  OfflineCapability,
  OfflineConfig,
  OfflineStats
} from './offline-manager';

// Import for default export
import { ollamaService } from './ollama-service';

// Default export for convenience
export default ollamaService;