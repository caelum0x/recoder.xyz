/**
 * Sandbox Configuration
 * Configuration management for sandbox providers
 */

import type {
  ProviderConfig,
  SandboxConfig,
  SandboxFactoryConfig,
  SandboxProviderType,
} from './types';

/**
 * Container timeout configurations for different user tiers and use cases
 */
export const CONTAINER_TIMEOUTS = {
  /** FREE user container timeout (10 minutes) */
  FREE: 10 * 60_000,
  /** Professional user container timeout (20 minutes) */
  PAID: 20 * 60_000,
  /** Container pause timeout (5 minutes) */
  PAUSE: 5 * 60_000,
  /** API default timeout for container operations (5 minutes) */
  API_DEFAULT: 5 * 60_000,
  /** Command execution default timeout (30 seconds) */
  COMMAND_DEFAULT: 30_000,
  /** File operation default timeout (15 seconds) */
  FILE_OPERATION: 15_000,
  /** Health check timeout (5 seconds) */
  HEALTH_CHECK: 5_000,
} as const;

/**
 * Default provider configurations
 */
export const DEFAULT_PROVIDER_CONFIGS: Record<SandboxProviderType, ProviderConfig> = {
  docker: {
    type: 'docker',
    timeout: 30_000,
    retries: 3,
  },
  e2b: {
    type: 'e2b',
    timeout: 30_000,
    retries: 3,
  },
  daytona: {
    type: 'daytona',
    timeout: 30_000,
    retries: 3,
  },
};

/**
 * Default sandbox configurations for different templates
 */
export const DEFAULT_SANDBOX_CONFIGS: Record<string, Partial<SandboxConfig>> = {
  'vite-react': {
    template: 'vite-react',
    timeoutMs: CONTAINER_TIMEOUTS.FREE,
    resources: {
      memory: 1024, // MB
      cpu: 2,
      disk: 2048, // MB
    },
    network: {
      enabled: true,
      allowedDomains: ['*.npmjs.org', '*.unpkg.com', '*.jsdelivr.net'],
      blockedPorts: [22, 3306, 5432],
    },
  },
  default: {
    template: 'default',
    timeoutMs: CONTAINER_TIMEOUTS.FREE,
    resources: {
      memory: 1024, // MB
      cpu: 1,
      disk: 1024, // MB
    },
    network: {
      enabled: true,
      allowedDomains: ['*.npmjs.org', '*.unpkg.com', '*.jsdelivr.net'],
      blockedPorts: [22, 3306, 5432],
    },
  },
};

/**
 * Configuration builder class
 */
export class SandboxConfigBuilder {
  private config: Partial<SandboxFactoryConfig> = {
    providers: {},
  };

  /**
   * Set the default provider
   */
  setDefaultProvider(provider: SandboxProviderType): this {
    this.config.defaultProvider = provider;
    return this;
  }

  /**
   * Add Docker provider configuration
   */
  addDockerProvider(config?: Partial<ProviderConfig>): this {
    if (!this.config.providers) {
      this.config.providers = {};
    }
    this.config.providers.docker = {
      ...DEFAULT_PROVIDER_CONFIGS.docker,
      ...config,
    };
    return this;
  }

  /**
   * Add E2B provider configuration
   */
  addE2BProvider(config?: Partial<ProviderConfig>): this {
    if (!this.config.providers) {
      this.config.providers = {};
    }
    this.config.providers.e2b = {
      ...DEFAULT_PROVIDER_CONFIGS.e2b,
      ...config,
    };
    return this;
  }

  /**
   * Add Daytona provider configuration
   */
  addDaytonaProvider(config?: Partial<ProviderConfig>): this {
    if (!this.config.providers) {
      this.config.providers = {};
    }
    this.config.providers.daytona = {
      ...DEFAULT_PROVIDER_CONFIGS.daytona,
      ...config,
    };
    return this;
  }

  /**
   * Load configuration from environment variables
   */
  fromEnvironment(): this {
    // Set default provider from environment
    const defaultProvider = (
      typeof import.meta !== 'undefined' && import.meta.env?.VITE_SANDBOX_DEFAULT_PROVIDER
    ) as SandboxProviderType | undefined;

    if (defaultProvider) {
      this.setDefaultProvider(defaultProvider);
    } else {
      // Default to docker if not specified
      this.setDefaultProvider('docker');
    }

    // Docker is always available as it's the primary provider
    const dockerUrl =
      typeof import.meta !== 'undefined'
        ? import.meta.env?.VITE_DOCKER_BACKEND_URL
        : undefined;
    this.addDockerProvider({
      apiUrl: dockerUrl || 'http://localhost:3100',
    });

    // Configure E2B from environment
    const e2bApiKey =
      typeof import.meta !== 'undefined' ? import.meta.env?.VITE_E2B_API_KEY : undefined;
    if (e2bApiKey) {
      this.addE2BProvider({
        apiKey: e2bApiKey,
      });
    }

    // Configure Daytona from environment
    const daytonaApiKey =
      typeof import.meta !== 'undefined' ? import.meta.env?.VITE_DAYTONA_API_KEY : undefined;
    const daytonaApiUrl =
      typeof import.meta !== 'undefined' ? import.meta.env?.VITE_DAYTONA_API_URL : undefined;
    if (daytonaApiKey || daytonaApiUrl) {
      this.addDaytonaProvider({
        apiKey: daytonaApiKey,
        apiUrl: daytonaApiUrl,
      });
    }

    return this;
  }

  /**
   * Merge with existing configuration
   */
  merge(config: Partial<SandboxFactoryConfig>): this {
    this.config = {
      ...this.config,
      ...config,
      providers: {
        ...this.config.providers,
        ...config.providers,
      },
    };
    return this;
  }

  /**
   * Build the final configuration
   */
  build(): SandboxFactoryConfig {
    // Set default provider if not specified
    if (!this.config.defaultProvider) {
      if (this.config.providers?.docker) {
        this.config.defaultProvider = 'docker';
      } else if (this.config.providers?.e2b) {
        this.config.defaultProvider = 'e2b';
      } else if (this.config.providers?.daytona) {
        this.config.defaultProvider = 'daytona';
      } else {
        throw new Error('No providers configured and no default provider specified');
      }
    }

    // Ensure at least one provider is configured
    if (!this.config.providers || Object.keys(this.config.providers).length === 0) {
      throw new Error('At least one provider must be configured');
    }

    return this.config as SandboxFactoryConfig;
  }
}

/**
 * Create a configuration builder
 */
export function createConfigBuilder(): SandboxConfigBuilder {
  return new SandboxConfigBuilder();
}

/**
 * Create default configuration (Docker only)
 */
export function createDefaultConfig(): SandboxFactoryConfig {
  return createConfigBuilder().addDockerProvider().setDefaultProvider('docker').build();
}

/**
 * Create configuration from environment variables
 */
export function createConfigFromEnvironment(): SandboxFactoryConfig {
  return createConfigBuilder().fromEnvironment().build();
}

/**
 * Get sandbox configuration for a specific template
 */
export function getSandboxConfigForTemplate(template: string): Partial<SandboxConfig> {
  const config = DEFAULT_SANDBOX_CONFIGS[template];
  if (config) {
    return config;
  }
  return DEFAULT_SANDBOX_CONFIGS.default as Partial<SandboxConfig>;
}

/**
 * Merge sandbox configurations
 */
export function mergeSandboxConfig(
  base: Partial<SandboxConfig>,
  override: Partial<SandboxConfig>
): SandboxConfig {
  return {
    template: override.template || base.template || 'default',
    projectId: override.projectId || base.projectId || '',
    timeoutMs: override.timeoutMs || base.timeoutMs || 10 * 60_000,
    env: {
      ...base.env,
      ...override.env,
    },
    resources: {
      ...base.resources,
      ...override.resources,
    },
    network: {
      ...base.network,
      ...override.network,
    },
  };
}

/**
 * Validate sandbox configuration
 */
export function validateSandboxConfig(config: SandboxConfig): void {
  if (!config.projectId) {
    throw new Error('Sandbox projectId is required');
  }

  if (config.timeoutMs && config.timeoutMs <= 0) {
    throw new Error('Timeout must be positive');
  }

  if (config.resources) {
    if (config.resources.memory && config.resources.memory <= 0) {
      throw new Error('Memory must be positive');
    }
    if (config.resources.cpu && config.resources.cpu <= 0) {
      throw new Error('CPU count must be positive');
    }
    if (config.resources.disk && config.resources.disk <= 0) {
      throw new Error('Disk size must be positive');
    }
  }
}

/**
 * Validate factory configuration
 */
export function validateFactoryConfig(config: SandboxFactoryConfig): void {
  if (!config.defaultProvider) {
    throw new Error('Default provider is required');
  }

  if (!config.providers || Object.keys(config.providers).length === 0) {
    throw new Error('At least one provider must be configured');
  }

  if (!config.providers[config.defaultProvider]) {
    throw new Error(`Default provider '${config.defaultProvider}' is not configured`);
  }

  // Validate each provider configuration
  for (const [providerType, providerConfig] of Object.entries(config.providers)) {
    if (providerConfig && !providerConfig.type) {
      throw new Error(`Provider type is required for ${providerType}`);
    }
    if (providerConfig && providerConfig.type !== providerType) {
      throw new Error(
        `Provider type mismatch for ${providerType}: expected '${providerType}', got '${providerConfig.type}'`
      );
    }
  }
}

/**
 * Get timeout for user tier
 */
export function getTimeoutForUserTier(tier: 'FREE' | 'PAID'): number {
  switch (tier) {
    case 'FREE':
      return CONTAINER_TIMEOUTS.FREE;
    default:
      return CONTAINER_TIMEOUTS.PAID;
  }
}
