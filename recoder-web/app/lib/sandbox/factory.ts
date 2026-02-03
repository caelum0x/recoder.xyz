/**
 * Sandbox Factory
 * Copied from open-lovable - Creates appropriate sandbox provider based on configuration
 */

import { SandboxProvider, type SandboxProviderConfig, type SandboxProviderType } from './types';
import { DockerProvider } from './providers/docker-provider';

/**
 * Factory for creating sandbox providers
 */
export class SandboxFactory {
  /**
   * Create a sandbox provider based on the specified type
   */
  static create(
    provider?: SandboxProviderType | string,
    config?: SandboxProviderConfig
  ): SandboxProvider {
    // Use environment variable if provider not specified
    const selectedProvider = provider || process.env.SANDBOX_PROVIDER || 'docker';

    switch (selectedProvider.toLowerCase()) {
      case 'docker':
        return new DockerProvider(config || {});

      case 'e2b':
        // E2B provider would be implemented here
        // For now, fall back to Docker
        console.warn('[SandboxFactory] E2B provider not yet implemented, using Docker');
        return new DockerProvider(config || {});

      case 'vercel':
        // Vercel provider would be implemented here
        // For now, fall back to Docker
        console.warn('[SandboxFactory] Vercel provider not yet implemented, using Docker');
        return new DockerProvider(config || {});

      case 'local':
        // Local provider for development
        return new DockerProvider(config || {});

      default:
        throw new Error(
          `Unknown sandbox provider: ${selectedProvider}. Supported providers: docker, e2b, vercel, local`
        );
    }
  }

  /**
   * Get list of available providers
   */
  static getAvailableProviders(): SandboxProviderType[] {
    return ['docker', 'e2b', 'vercel', 'local'];
  }

  /**
   * Check if a provider is available based on environment configuration
   */
  static isProviderAvailable(provider: string): boolean {
    switch (provider.toLowerCase()) {
      case 'docker':
        // Docker is always available if backend is running
        return true;

      case 'e2b':
        return !!process.env.E2B_API_KEY;

      case 'vercel':
        return (
          !!process.env.VERCEL_OIDC_TOKEN ||
          (!!process.env.VERCEL_TOKEN &&
            !!process.env.VERCEL_TEAM_ID &&
            !!process.env.VERCEL_PROJECT_ID)
        );

      case 'local':
        return true;

      default:
        return false;
    }
  }

  /**
   * Get the default provider based on available configuration
   */
  static getDefaultProvider(): SandboxProviderType {
    // Check in order of preference
    if (this.isProviderAvailable('e2b')) {
      return 'e2b';
    }
    if (this.isProviderAvailable('vercel')) {
      return 'vercel';
    }
    // Default to docker
    return 'docker';
  }

  /**
   * Get provider configuration from environment
   */
  static getConfigFromEnvironment(): SandboxProviderConfig {
    return {
      e2b: process.env.E2B_API_KEY
        ? {
            apiKey: process.env.E2B_API_KEY,
            timeoutMs: parseInt(process.env.E2B_TIMEOUT_MS || '1800000', 10),
            template: process.env.E2B_TEMPLATE,
          }
        : undefined,
      vercel: process.env.VERCEL_TOKEN
        ? {
            teamId: process.env.VERCEL_TEAM_ID,
            projectId: process.env.VERCEL_PROJECT_ID,
            token: process.env.VERCEL_TOKEN,
            authMethod: process.env.VERCEL_OIDC_TOKEN ? 'oidc' : 'pat',
          }
        : undefined,
      docker: {
        endpoint: process.env.DOCKER_BACKEND_URL || 'http://localhost:4000',
        authToken: process.env.DOCKER_AUTH_TOKEN,
        containerId: process.env.DOCKER_CONTAINER_ID,
      },
    };
  }
}

// Export individual provider for direct use
export { DockerProvider } from './providers/docker-provider';
