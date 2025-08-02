/**
 * Plugins Package - Main Exports
 * Comprehensive plugin system for Recoder.xyz extensibility
 */

// Core Plugin SDK
export * from '../plugin-sdk/types';
export { PluginLifecycleManager, PluginState, LoadedPlugin, LifecycleConfig } from '../plugin-sdk/lifecycle';
export { PluginSandbox } from '../plugin-sdk/sandbox';

// Marketplace and Registry
export { PluginRegistry, RegistryConfig, RegistryStorage, RegistryStatistics } from '../marketplace/registry';
export { PluginInstaller } from '../marketplace/installer';
export { PluginRatingSystem } from '../marketplace/rating-system';

// Core Plugins - Re-export main functionality
export { default as DockerSupportPlugin } from '../core-plugins/docker-support';
export { default as GitIntegrationPlugin } from '../core-plugins/git-integration';
// export { DeploymentProvidersPlugin } from '../core-plugins/deployment-providers'; // Removed due to missing export


// Plugin Manager - Central orchestrator
export { PluginManager } from './plugin-manager';

// Plugin Development Utilities
//export { createPluginTemplate, validatePluginManifest, PluginValidator } from './dev-utils';

// Plugin Events and Analytics
export { PluginEventBus } from './event-bus';
export { PluginAnalyticsTracker } from './analytics-tracker';