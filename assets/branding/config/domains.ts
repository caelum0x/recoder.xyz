/**
 * Recoder.xyz Domain Configuration
 * 
 * Centralized domain and URL configuration for all recoder.xyz products.
 * Used across CLI, Web Platform, and VS Code Extension.
 */

export interface RecoderDomains {
  main: string;
  web: string;
  docs: string;
  api: string;
  cdn: string;
  auth: string;
  support: string;
  blog: string;
  github: string;
  marketplace: string;
}

export interface RecoderEnvironmentConfig {
  domains: RecoderDomains;
  apiVersion: string;
  features: {
    offlineMode: boolean;
    multiAI: boolean;
    realCodeGeneration: boolean;
    performanceOptimization: boolean;
  };
}

// Production configuration
export const PRODUCTION_CONFIG: RecoderEnvironmentConfig = {
  domains: {
    main: 'https://recoder.xyz',
    web: 'https://web.recoder.xyz',
    docs: 'https://docs.recoder.xyz',
    api: 'https://api.recoder.xyz',
    cdn: 'https://cdn.recoder.xyz',
    auth: 'https://auth.recoder.xyz',
    support: 'https://support.recoder.xyz',
    blog: 'https://blog.recoder.xyz',
    github: 'https://github.com/recoderxyz/recoder.xyz',
    marketplace: 'https://marketplace.visualstudio.com/items?itemName=recoderxyz.recoder-vscode'
  },
  apiVersion: 'v1',
  features: {
    offlineMode: true,
    multiAI: true,
    realCodeGeneration: true,
    performanceOptimization: true
  }
};

// Development configuration
export const DEVELOPMENT_CONFIG: RecoderEnvironmentConfig = {
  domains: {
    main: 'http://localhost:3000',
    web: 'http://localhost:3001',
    docs: 'http://localhost:3002',
    api: 'http://localhost:8000',
    cdn: 'http://localhost:8001',
    auth: 'http://localhost:8002',
    support: 'http://localhost:3003',
    blog: 'http://localhost:3004',
    github: 'https://github.com/recoderxyz/recoder.xyz',
    marketplace: 'https://marketplace.visualstudio.com/items?itemName=recoderxyz.recoder-vscode'
  },
  apiVersion: 'v1',
  features: {
    offlineMode: true,
    multiAI: true,
    realCodeGeneration: true,
    performanceOptimization: true
  }
};

// Staging configuration
export const STAGING_CONFIG: RecoderEnvironmentConfig = {
  domains: {
    main: 'https://staging.recoder.xyz',
    web: 'https://web-staging.recoder.xyz',
    docs: 'https://docs-staging.recoder.xyz',
    api: 'https://api-staging.recoder.xyz',
    cdn: 'https://cdn-staging.recoder.xyz',
    auth: 'https://auth-staging.recoder.xyz',
    support: 'https://support-staging.recoder.xyz',
    blog: 'https://blog-staging.recoder.xyz',
    github: 'https://github.com/recoderxyz/recoder.xyz',
    marketplace: 'https://marketplace.visualstudio.com/items?itemName=recoderxyz.recoder-vscode'
  },
  apiVersion: 'v1',
  features: {
    offlineMode: true,
    multiAI: true,
    realCodeGeneration: true,
    performanceOptimization: true
  }
};

/**
 * Get configuration based on environment
 */
export function getRecoderConfig(): RecoderEnvironmentConfig {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return PRODUCTION_CONFIG;
    case 'staging':
      return STAGING_CONFIG;
    default:
      return DEVELOPMENT_CONFIG;
  }
}

/**
 * URL builder utilities
 */
export class RecoderURLBuilder {
  private config: RecoderEnvironmentConfig;

  constructor(config?: RecoderEnvironmentConfig) {
    this.config = config || getRecoderConfig();
  }

  // Main domain URLs
  home(): string {
    return this.config.domains.main;
  }

  web(path = ''): string {
    return `${this.config.domains.web}${path}`;
  }

  docs(path = ''): string {
    return `${this.config.domains.docs}${path}`;
  }

  api(endpoint = ''): string {
    return `${this.config.domains.api}/${this.config.apiVersion}${endpoint}`;
  }

  cdn(asset = ''): string {
    return `${this.config.domains.cdn}${asset}`;
  }

  auth(action = ''): string {
    return `${this.config.domains.auth}${action}`;
  }

  support(section = ''): string {
    return `${this.config.domains.support}${section}`;
  }

  blog(post = ''): string {
    return `${this.config.domains.blog}${post}`;
  }

  // GitHub URLs
  github(path = ''): string {
    return `${this.config.domains.github}${path}`;
  }

  githubIssues(): string {
    return this.github('/issues');
  }

  githubReleases(): string {
    return this.github('/releases');
  }

  // Marketplace URLs
  marketplace(): string {
    return this.config.domains.marketplace;
  }

  // API endpoint builders
  aiGenerate(): string {
    return this.api('/ai/generate');
  }

  aiChat(): string {
    return this.api('/ai/chat');
  }

  aiModels(): string {
    return this.api('/ai/models');
  }

  userProfile(): string {
    return this.api('/user/profile');
  }

  projectAnalysis(): string {
    return this.api('/projects/analyze');
  }
}

/**
 * URL constants for quick access
 */
export const RECODER_URLS = new RecoderURLBuilder();

/**
 * Brand constants
 */
export const RECODER_BRAND = {
  name: 'Recoder',
  fullName: 'Recoder.xyz',
  tagline: 'AI-Powered Development Platform',
  description: 'The only AI coding platform that generates real, production-ready code',
  keywords: ['recoder', 'ai', 'coding', 'development', 'code-generation', 'multi-ai', 'offline'],
  
  // Social media handles
  social: {
    twitter: '@recoderxyz',
    github: 'recoderxyz',
    linkedin: 'company/recoder-xyz',
    discord: 'recoder-xyz'
  },

  // Legal
  copyright: `© ${new Date().getFullYear()} Recoder.xyz. All rights reserved.`,
  
  // Contact
  contact: {
    email: 'hello@recoder.xyz',
    support: 'support@recoder.xyz',
    security: 'security@recoder.xyz'
  }
};

/**
 * Feature flags
 */
export const RECODER_FEATURES = {
  // AI Features
  MULTI_AI_SUPPORT: true,
  OFFLINE_MODE: true,
  REAL_CODE_GENERATION: true,
  INTELLIGENT_RECOMMENDATIONS: true,
  
  // Platform Features  
  WEB_PLATFORM: true,
  VSCODE_EXTENSION: true,
  CLI_TOOL: true,
  
  // Advanced Features
  PERFORMANCE_OPTIMIZATION: true,
  BACKGROUND_UPDATES: true,
  PROJECT_ANALYSIS: true,
  CODE_REVIEW: true,
  
  // Beta Features
  BROWSER_AUTOMATION: false,
  MOBILE_DEVELOPMENT: false,
  BLOCKCHAIN_INTEGRATION: false
};

export default {
  getRecoderConfig,
  RecoderURLBuilder,
  RECODER_URLS,
  RECODER_BRAND,
  RECODER_FEATURES,
  PRODUCTION_CONFIG,
  DEVELOPMENT_CONFIG,
  STAGING_CONFIG
};