/**
 * Sandbox Factory
 * Factory for creating and managing sandbox providers with health checking,
 * retry logic, and automatic failover
 */

import type { ISandbox, ISandboxProvider } from './interfaces';
import {
  DockerSandboxProvider,
  E2BSandboxProvider,
  DaytonaSandboxProvider,
} from './providers';
import type {
  HealthCheckResult,
  ProviderConfig,
  SandboxConnectOptions,
  SandboxCreateOptions,
  SandboxFactoryConfig,
  SandboxProviderType,
} from './types';
import { SandboxError, SandboxErrorType } from './types';
import {
  createConfigFromEnvironment,
  validateFactoryConfig,
} from './config';
import { tryCatch, retryWithBackoff, isRetryableError } from './utils';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SandboxFactory');

/**
 * Sandbox factory for creating and managing sandbox providers
 */
export class SandboxFactory {
  private providers = new Map<SandboxProviderType, ISandboxProvider>();
  private config: SandboxFactoryConfig;
  private healthCache = new Map<SandboxProviderType, { result: HealthCheckResult; timestamp: number }>();
  private healthCacheTTL = 30_000; // 30 seconds

  constructor(config: SandboxFactoryConfig) {
    this.config = config;
  }

  /**
   * Initialize the factory with providers
   */
  async initialize(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    // Initialize Docker provider if configured
    if (this.config.providers.docker) {
      const dockerProvider = new DockerSandboxProvider();
      initPromises.push(
        dockerProvider.initialize(this.config.providers.docker).then(() => {
          this.providers.set('docker', dockerProvider);
        }).catch((error) => {
          logger.warn('Failed to initialize Docker provider:', error.message);
        })
      );
    }

    // Initialize E2B provider if configured
    if (this.config.providers.e2b) {
      const e2bProvider = new E2BSandboxProvider();
      initPromises.push(
        e2bProvider.initialize(this.config.providers.e2b).then(() => {
          this.providers.set('e2b', e2bProvider);
        }).catch((error) => {
          logger.warn('Failed to initialize E2B provider:', error.message);
        })
      );
    }

    // Initialize Daytona provider if configured
    if (this.config.providers.daytona) {
      const daytonaProvider = new DaytonaSandboxProvider();
      initPromises.push(
        daytonaProvider.initialize(this.config.providers.daytona).then(() => {
          this.providers.set('daytona', daytonaProvider);
        }).catch((error) => {
          logger.warn('Failed to initialize Daytona provider:', error.message);
        })
      );
    }

    // Wait for all providers to initialize
    await Promise.all(initPromises);

    // Ensure at least one provider is available
    if (this.providers.size === 0) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        'No sandbox providers could be initialized'
      );
    }

    // Validate default provider
    if (!this.providers.has(this.config.defaultProvider)) {
      // Fall back to first available provider
      const firstProvider = Array.from(this.providers.keys())[0];
      logger.warn(
        `Default provider '${this.config.defaultProvider}' not available. Falling back to '${firstProvider}'`
      );
      this.config.defaultProvider = firstProvider;
    }
  }

  /**
   * Create a sandbox using the specified or default provider
   */
  async createSandbox(options: SandboxCreateOptions): Promise<ISandbox> {
    const providerType = options.provider || this.config.defaultProvider;
    const provider = this.getProvider(providerType);

    // Use retry logic for sandbox creation
    return retryWithBackoff(
      () => provider.create(options),
      {
        maxRetries: 2,
        delay: 2000,
        backoff: 'exponential',
        retryableErrors: [SandboxErrorType.CREATION_FAILED, SandboxErrorType.TIMEOUT],
      }
    );
  }

  /**
   * Create a sandbox with automatic fallback to other providers
   */
  async createSandboxWithFallback(options: SandboxCreateOptions): Promise<ISandbox> {
    const preferredProvider = options.provider || this.config.defaultProvider;
    const providers = this.getProviderPriorityList(preferredProvider);

    let lastError: Error | undefined;

    for (const providerType of providers) {
      const provider = this.providers.get(providerType);
      if (!provider) continue;

      // Check health before attempting
      const health = await this.getProviderHealth(providerType);
      if (!health.healthy) {
        logger.warn(`Provider ${providerType} is unhealthy, skipping`);
        continue;
      }

      const [sandbox, error] = await tryCatch(() =>
        provider.create(options)
      );

      if (sandbox) {
        return sandbox;
      }

      lastError = error;
      logger.warn(`Failed to create sandbox with ${providerType}: ${error?.message}`);
    }

    throw new SandboxError(
      SandboxErrorType.CREATION_FAILED,
      `Failed to create sandbox with any provider: ${lastError?.message || 'Unknown error'}`,
      undefined,
      lastError
    );
  }

  /**
   * Connect to an existing sandbox
   */
  async connectToSandbox(
    sandboxId: string,
    providerType?: SandboxProviderType,
    options?: SandboxConnectOptions
  ): Promise<ISandbox> {
    const provider = this.getProvider(providerType || this.config.defaultProvider);
    return provider.connect(sandboxId, options);
  }

  /**
   * Resume a stopped sandbox
   */
  async resumeSandbox(
    sandboxId: string,
    providerType?: SandboxProviderType,
    options?: SandboxConnectOptions
  ): Promise<ISandbox> {
    const provider = this.getProvider(providerType || this.config.defaultProvider);
    return provider.resume(sandboxId, options);
  }

  /**
   * Get a specific provider instance
   */
  getProvider(providerType: SandboxProviderType): ISandboxProvider {
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        `Provider '${providerType}' is not configured or initialized`
      );
    }
    return provider;
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): SandboxProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(providerType: SandboxProviderType): boolean {
    return this.providers.has(providerType);
  }

  /**
   * Get the default provider
   */
  getDefaultProvider(): ISandboxProvider {
    return this.getProvider(this.config.defaultProvider);
  }

  /**
   * Get default provider type
   */
  getDefaultProviderType(): SandboxProviderType {
    return this.config.defaultProvider;
  }

  /**
   * Update provider configuration
   */
  async updateProviderConfig(
    providerType: SandboxProviderType,
    config: ProviderConfig
  ): Promise<void> {
    const provider = this.getProvider(providerType);
    await provider.initialize(config);
    // Clear health cache for this provider
    this.healthCache.delete(providerType);
  }

  /**
   * Add a new provider at runtime
   */
  async addProvider(providerType: SandboxProviderType, config: ProviderConfig): Promise<void> {
    let provider: ISandboxProvider;

    switch (providerType) {
      case 'docker':
        provider = new DockerSandboxProvider();
        break;
      case 'e2b':
        provider = new E2BSandboxProvider();
        break;
      case 'daytona':
        provider = new DaytonaSandboxProvider();
        break;
      default:
        throw new SandboxError(
          SandboxErrorType.CONFIGURATION_ERROR,
          `Unknown provider type: ${providerType}`
        );
    }

    await provider.initialize(config);
    this.providers.set(providerType, provider);
  }

  /**
   * Remove a provider
   */
  removeProvider(providerType: SandboxProviderType): void {
    if (providerType === this.config.defaultProvider) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        'Cannot remove the default provider'
      );
    }
    this.providers.delete(providerType);
    this.healthCache.delete(providerType);
  }

  /**
   * Set the default provider
   */
  setDefaultProvider(providerType: SandboxProviderType): void {
    if (!this.providers.has(providerType)) {
      throw new SandboxError(
        SandboxErrorType.CONFIGURATION_ERROR,
        `Provider '${providerType}' is not available`
      );
    }
    this.config.defaultProvider = providerType;
  }

  /**
   * Get factory configuration
   */
  getConfig(): SandboxFactoryConfig {
    return { ...this.config };
  }

  /**
   * Get provider health with caching
   */
  async getProviderHealth(providerType: SandboxProviderType): Promise<HealthCheckResult> {
    const cached = this.healthCache.get(providerType);
    if (cached && Date.now() - cached.timestamp < this.healthCacheTTL) {
      return cached.result;
    }

    const provider = this.providers.get(providerType);
    if (!provider) {
      return {
        healthy: false,
        latency: 0,
        provider: providerType,
        error: 'Provider not available',
      };
    }

    const result = await provider.healthCheck();
    this.healthCache.set(providerType, {
      result,
      timestamp: Date.now(),
    });

    return result;
  }

  /**
   * Get health status of all providers
   */
  async getAllProvidersHealth(): Promise<Map<SandboxProviderType, HealthCheckResult>> {
    const results = new Map<SandboxProviderType, HealthCheckResult>();

    await Promise.all(
      Array.from(this.providers.keys()).map(async (providerType) => {
        const health = await this.getProviderHealth(providerType);
        results.set(providerType, health);
      })
    );

    return results;
  }

  /**
   * Get the healthiest available provider
   */
  async getHealthiestProvider(): Promise<SandboxProviderType | null> {
    const healthResults = await this.getAllProvidersHealth();

    let bestProvider: SandboxProviderType | null = null;
    let bestLatency = Infinity;

    for (const [providerType, health] of healthResults) {
      if (health.healthy && health.latency < bestLatency) {
        bestProvider = providerType;
        bestLatency = health.latency;
      }
    }

    return bestProvider;
  }

  /**
   * Get provider priority list for fallback
   */
  private getProviderPriorityList(preferred: SandboxProviderType): SandboxProviderType[] {
    const allProviders = Array.from(this.providers.keys());

    // Put preferred provider first
    const sorted = allProviders.sort((a, b) => {
      if (a === preferred) return -1;
      if (b === preferred) return 1;
      // Docker is second priority if not preferred
      if (a === 'docker') return -1;
      if (b === 'docker') return 1;
      return 0;
    });

    return sorted;
  }
}

/**
 * Global sandbox factory instance
 */
let globalFactory: SandboxFactory | null = null;

/**
 * Initialize the global sandbox factory
 */
export async function initializeSandboxFactory(
  config?: SandboxFactoryConfig
): Promise<SandboxFactory> {
  const factoryConfig = config || createConfigFromEnvironment();

  // Validate configuration
  validateFactoryConfig(factoryConfig);

  globalFactory = new SandboxFactory(factoryConfig);
  await globalFactory.initialize();
  return globalFactory;
}

/**
 * Get the global sandbox factory instance
 * Initializes with default config if not already initialized
 */
export async function getSandboxFactory(): Promise<SandboxFactory> {
  if (!globalFactory) {
    return initializeSandboxFactory();
  }
  return globalFactory;
}

/**
 * Get the global sandbox factory instance synchronously
 * Throws if not initialized
 */
export function getSandboxFactorySync(): SandboxFactory {
  if (!globalFactory) {
    throw new SandboxError(
      SandboxErrorType.CONFIGURATION_ERROR,
      'Sandbox factory not initialized. Call initializeSandboxFactory() first.'
    );
  }
  return globalFactory;
}

/**
 * Convenience function to create a sandbox using the global factory
 */
export async function createSandbox(options: SandboxCreateOptions): Promise<ISandbox> {
  const factory = await getSandboxFactory();
  return factory.createSandbox(options);
}

/**
 * Convenience function to connect to a sandbox using the global factory
 */
export async function connectToSandbox(
  sandboxId: string,
  providerType?: SandboxProviderType,
  options?: SandboxConnectOptions
): Promise<ISandbox> {
  const factory = await getSandboxFactory();
  return factory.connectToSandbox(sandboxId, providerType, options);
}

/**
 * Convenience function to resume a sandbox using the global factory
 */
export async function resumeSandbox(
  sandboxId: string,
  providerType?: SandboxProviderType,
  options?: SandboxConnectOptions
): Promise<ISandbox> {
  const factory = await getSandboxFactory();
  return factory.resumeSandbox(sandboxId, providerType, options);
}

/**
 * Create a sandbox factory with default configuration
 */
export function createDefaultSandboxFactory(): SandboxFactory {
  const config: SandboxFactoryConfig = {
    defaultProvider: 'docker',
    providers: {
      docker: {
        type: 'docker',
      },
    },
  };

  return new SandboxFactory(config);
}

/**
 * Create a sandbox factory from environment variables
 */
export function createSandboxFactoryFromEnv(): SandboxFactory {
  const config = createConfigFromEnvironment();
  return new SandboxFactory(config);
}
