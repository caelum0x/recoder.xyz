/**
 * Builder Service
 *
 * Vite-based build service for compiling and bundling project assets.
 * Adapted from libra/apps/builder for recoder-web.
 *
 * Features:
 * - Vite build process execution
 * - Worker code compilation
 * - Asset bundling and optimization
 * - Build configuration management
 * - Progress tracking and error reporting
 */

// Core build service
export {
  BuildService,
  createBuildService,
  getBuildService,
  // Build execution
  executeBuild,
  executeBuildWithProgress,
  // Build validation
  validateBuildConfig,
  validateBuildOutput,
  // Build cleanup
  cleanBuildArtifacts,
  // State stores
  buildStatus,
  buildProgress,
  buildErrors,
  buildResult,
  isBuildInProgress,
  type BuildResult,
  type BuildProgress,
  type BuildConfig,
  type BuildStatus,
  type BuildError,
  type BuildArtifact,
} from './build-service';

// Vite configuration
export {
  createViteConfig,
  getDefaultViteConfig,
  mergeViteConfigs,
  validateViteConfig,
  getVitePlugins,
  type ViteConfig,
  type VitePluginConfig,
  type ViteServerConfig,
  type ViteBuildConfig,
  type ViteResolveConfig,
} from './vite-config';

// Worker compilation
export {
  compileWorker,
  compileWorkerFromSource,
  bundleWorkerCode,
  validateWorkerCode,
  getWorkerTemplate,
  createHonoWorker,
  type WorkerCompilationResult,
  type WorkerConfig,
  type WorkerTemplate,
} from './worker-compiler';

// Asset bundling
export {
  bundleAssets,
  optimizeAssets,
  hashAssets,
  generateManifest,
  getAssetStats,
  compressAssets,
  type AssetBundle,
  type AssetManifest,
  type AssetStats,
  type AssetOptimizationOptions,
} from './asset-bundler';

// Build configuration presets
export {
  BUILD_PRESETS,
  getPresetConfig,
  getPresetForFramework,
  listAvailablePresets,
  type BuildPreset,
  type PresetName,
} from './build-presets';
