/**
 * Recoder Web Platform Configuration
 * 
 * Central configuration for the Recoder Web Platform integrating with
 * the existing recoder.xyz CLI ecosystem and multi-AI capabilities.
 */

import { getRecoderConfig, RecoderURLBuilder, RECODER_BRAND } from '../../assets/branding/config/domains';

// Import the centralized domain configuration
const recoderConfig = getRecoderConfig();
export const recoderURLs = new RecoderURLBuilder(recoderConfig);

/**
 * Web Platform Specific Configuration
 */
export const WEB_PLATFORM_CONFIG = {
  // App metadata
  app: {
    name: RECODER_BRAND.name,
    fullName: RECODER_BRAND.fullName,
    description: RECODER_BRAND.description,
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },

  // AI Provider Configuration
  ai: {
    providers: {
      claude: {
        enabled: !!process.env.ANTHROPIC_API_KEY,
        models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
        useCases: ['complex-logic', 'architecture', 'code-review', 'security']
      },
      groq: {
        enabled: !!process.env.GROQ_API_KEY,
        models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant'],
        useCases: ['fast-generation', 'api-endpoints', 'prototyping']
      },
      gemini: {
        enabled: !!process.env.GOOGLE_API_KEY,
        models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro'],
        useCases: ['multimodal', 'large-context', 'documentation']
      },
      ollama: {
        enabled: true, // Always available for offline mode
        models: ['phi:2.7b', 'llama2:7b', 'codellama:7b'],
        useCases: ['offline', 'privacy', 'custom-models']
      },
      together: {
        enabled: !!process.env.TOGETHER_API_KEY,
        models: ['meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo'],
        useCases: ['legacy-support'] // For backward compatibility
      }
    },
    
    // Default provider selection strategy
    defaultProvider: 'auto', // Intelligent selection based on task
    
    // Generation settings
    generation: {
      realCodeOnly: true, // Never generate mock implementations
      includeTests: true,
      includeDocumentation: true,
      optimizeForProduction: true
    }
  },

  // Database and Storage
  database: {
    url: process.env.DATABASE_URL,
    provider: 'postgresql',
    features: {
      shareableLinks: true,
      userProjects: true,
      generationHistory: true,
      caching: true
    }
  },

  // Sandpack Configuration (Enhanced)
  sandbox: {
    template: 'nextjs',
    dependencies: {
      // Core React/Next.js dependencies
      'react': '^19.0.0',
      'react-dom': '^19.0.0',
      'next': '^15.1.4',
      
      // UI and Styling
      'tailwindcss': '^3.4.17',
      '@headlessui/react': '^2.2.0',
      'lucide-react': '^0.468.0',
      'framer-motion': '^11.18.0',
      
      // Real functionality dependencies
      'prisma': '^6.2.1',
      '@prisma/client': '^6.2.1',
      'stripe': '^16.12.0',
      'next-auth': '^4.24.8',
      'nodemailer': '^6.9.15',
      'zod': '^3.24.1',
      
      // Development tools
      'typescript': '^5.6.3',
      '@types/react': '^19.0.1',
      '@types/node': '^20.17.6'
    },
    
    // Real environment variables for generated code
    environmentVariables: {
      'NEXT_PUBLIC_APP_URL': recoderURLs.web(),
      'NEXT_PUBLIC_RECODER_API': recoderURLs.api(),
      // Note: Sensitive keys would be handled securely in production
    }
  },

  // Feature Flags
  features: {
    // Core features
    codeGeneration: true,
    realTimePreview: true,
    codeExecution: true,
    
    // Advanced features
    multiAISelection: true,
    offlineMode: true,
    projectContext: true,
    codeReview: true,
    
    // Integration features
    cliIntegration: true,
    vscodeSync: true,
    githubIntegration: false, // TODO: Implement
    
    // Beta features
    voiceInput: false,
    collaborativeEditing: false,
    mobilePreview: false
  },

  // Analytics and Monitoring
  analytics: {
    plausible: {
      enabled: process.env.NODE_ENV === 'production',
      domain: 'web.recoder.xyz'
    },
    
    // Performance monitoring
    performance: {
      trackGenerationTime: true,
      trackProviderSelection: true,
      trackUserSatisfaction: true
    }
  },

  // Security Configuration
  security: {
    // Content Security Policy
    csp: {
      enabled: true,
      allowUnsafeEval: true, // Required for code execution
      allowedDomains: [
        recoderConfig.domains.main,
        recoderConfig.domains.web,
        recoderConfig.domains.api,
        recoderConfig.domains.cdn,
        '*.vercel.app', // For Vercel deployments
        'fonts.googleapis.com', // For fonts
        'codesandbox.io' // For Sandpack
      ]
    },
    
    // Rate limiting
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      skipSuccessfulRequests: true
    }
  }
};

/**
 * Environment-specific overrides
 */
const environmentOverrides = {
  development: {
    ai: {
      generation: {
        realCodeOnly: false, // Allow mock code in development for testing
      }
    },
    security: {
      csp: {
        enabled: false // Disable CSP in development for easier debugging
      }
    }
  },
  
  production: {
    analytics: {
      plausible: {
        enabled: true
      }
    },
    security: {
      csp: {
        enabled: true
      }
    }
  }
};

// Apply environment-specific overrides
const currentEnv = WEB_PLATFORM_CONFIG.app.environment;
if (environmentOverrides[currentEnv as keyof typeof environmentOverrides]) {
  Object.assign(WEB_PLATFORM_CONFIG, environmentOverrides[currentEnv as keyof typeof environmentOverrides]);
}

/**
 * Helper functions for configuration access
 */
export const getAIProviders = () => {
  return Object.entries(WEB_PLATFORM_CONFIG.ai.providers)
    .filter(([_, config]) => config.enabled)
    .map(([name, config]) => ({ name, ...config }));
};

export const isFeatureEnabled = (feature: string): boolean => {
  return WEB_PLATFORM_CONFIG.features[feature as keyof typeof WEB_PLATFORM_CONFIG.features] || false;
};

export const getProviderForUseCase = (useCase: string): string => {
  const providers = getAIProviders();
  const suitableProvider = providers.find(provider => 
    provider.useCases.includes(useCase)
  );
  
  return suitableProvider?.name || 'claude'; // Default to Claude
};

export const getBrandConfig = () => ({
  ...RECODER_BRAND,
  urls: recoderURLs,
  config: recoderConfig
});

// Export the main configuration
export default WEB_PLATFORM_CONFIG;