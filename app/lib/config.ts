/**
 * Configuration for Recoder.xyz
 * Handles environment-specific URLs and settings
 */

export const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',

  // Core URLs
  urls: {
    // Main website (landing, auth pages, pricing)
    web: process.env.NEXT_PUBLIC_APP_URL ||
         process.env.NEXT_PUBLIC_SITE_URL ||
         (process.env.NODE_ENV === 'production' ? 'https://recoder.xyz' : 'http://localhost:3000'),

    // Bolt-like IDE app
    app: process.env.NEXT_PUBLIC_WEB_APP_URL ||
         (process.env.NODE_ENV === 'production' ? 'https://web.recoder.xyz' : 'http://localhost:5173'),

    // Docker backend API gateway
    api: process.env.NEXT_PUBLIC_API_URL ||
         (process.env.NODE_ENV === 'production' ? 'https://api.recoder.xyz' : 'http://localhost:3100'),

    // Suna frontend IDE
    frontend: process.env.RECODER_FRONTEND_URL ||
         (process.env.NODE_ENV === 'production' ? 'https://frontend.recoder.xyz' : 'http://localhost:3001'),

    // Python backend
    backend: process.env.RECODER_BACKEND_URL ||
         (process.env.NODE_ENV === 'production' ? 'https://backend.recoder.xyz' : 'http://localhost:8000'),

    // Project management
    pm: process.env.RECODER_PM_URL ||
         (process.env.NODE_ENV === 'production' ? 'https://pm.recoder.xyz' : 'http://localhost:3004'),

    // Visual workflow designer
    studio: process.env.RECODER_STUDIO_URL ||
         (process.env.NODE_ENV === 'production' ? 'https://studio.recoder.xyz' : 'http://localhost:3005'),

    // AI agent workflows
    agency: process.env.RECODER_AGENCY_URL ||
         (process.env.NODE_ENV === 'production' ? 'https://agency.recoder.xyz' : 'http://localhost:3007'),

    // Open-source AI tools
    openclaw: process.env.RECODER_OPENCLAW_URL ||
         (process.env.NODE_ENV === 'production' ? 'https://openclaw.recoder.xyz' : 'http://localhost:18789'),

    // CLI callback (local only for development)
    cliCallback: process.env.CLI_CALLBACK_URL || 'http://localhost:8080/auth/callback',
  },

  // OAuth Configuration
  oauth: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || process.env.GITHUB_APP_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackUrl: (baseUrl: string) => `${baseUrl}/api/auth/callback/github`,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: (baseUrl: string) => `${baseUrl}/api/auth/callback/google`,
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      callbackUrl: (baseUrl: string) => `${baseUrl}/api/auth/callback/discord`,
    },
  },

  // CLI Configuration
  cli: {
    clientId: process.env.CLI_CLIENT_ID || 'recoder-cli',
    callbackPort: parseInt(process.env.CLI_CALLBACK_PORT || '8080'),
    deviceCodeExpiry: parseInt(process.env.CLI_DEVICE_CODE_EXPIRY || '900'), // 15 minutes
  },

  // Payment Configuration
  payment: {
    paddle: {
      vendorId: process.env.PADDLE_VENDOR_ID || process.env.NEXT_PUBLIC_PADDLE_VENDOR_ID,
      apiKey: process.env.PADDLE_API_KEY,
      webhookSecret: process.env.PADDLE_WEBHOOK_SECRET,
      environment: (process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT || 
                   (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox')) as 'sandbox' | 'production',
      products: {
        weekly: process.env.PADDLE_PRODUCT_WEEKLY || 'prod_weekly_temp',
        monthly: process.env.PADDLE_PRODUCT_MONTHLY || 'prod_monthly_temp',
        pro: process.env.PADDLE_PRODUCT_PRO || 'prod_pro_temp',
      },
    },
    dodo: {
      apiKey: process.env.DODO_PAY_API_KEY,
      secret: process.env.DODO_PAY_SECRET,
      webhookSecret: process.env.DODO_PAY_WEBHOOK_SECRET,
      baseUrl: process.env.DODO_PAY_BASE_URL || 'https://api.dodopay.com/v1',
      environment: process.env.NODE_ENV === 'production' ? 'live' : 'test',
    },
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET,
    nextAuthSecret: process.env.NEXTAUTH_SECRET,
    sessionSyncSecret: process.env.SESSION_SYNC_SECRET,
    apiKeyEncryptionSecret: process.env.API_KEY_ENCRYPTION_SECRET,
  },

  // Database
  database: {
    url: process.env.DATABASE_URL,
  },

  // Redis (optional)
  redis: {
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD,
    tlsEnabled: process.env.REDIS_TLS_ENABLED === 'true',
  },

  // AI Providers (for platform keys - PRO users)
  ai: {
    openrouter: {
      keys: [
        process.env.OPENROUTER_API_KEY_1,
        process.env.OPENROUTER_API_KEY_2,
        process.env.OPENROUTER_API_KEY_3,
      ].filter(Boolean) as string[],
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
    },
  },

  // Feature Flags
  features: {
    deviceFlow: process.env.ENABLE_DEVICE_FLOW !== 'false',
    apiKeys: process.env.ENABLE_API_KEYS !== 'false',
    oauth: process.env.ENABLE_OAUTH !== 'false',
    twoFactor: process.env.ENABLE_TWO_FACTOR === 'true',
  },

  // Rate Limiting
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },

  // Session-Based Usage Model (No token/cost display to users)
  usage: {
    // Daily session limits per plan
    sessionsPerDay: {
      free: 6,
      weekly: 10,
      monthly: 15,
      pro: 20,
      enterprise: Infinity,
    },
    // Token limits per session (only for pricey models)
    priceyTokensPerSession: {
      free: 10_000,
      weekly: 30_000,
      monthly: 50_000,
      pro: 100_000,
      enterprise: Infinity,
    },
    // Session inactivity timeout (30 minutes)
    sessionInactivityMs: 30 * 60 * 1000,
  },

  // Model categorization
  models: {
    pricey: [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-opus',
      'google/gemini-2.5-pro',
      'openai/gpt-4-turbo',
      'openai/o1-preview',
      'openai/o1-mini',
    ],
    free: [
      'google/gemini-flash-8b',
      'google/gemini-flash-1.5',
      'meta-llama/llama-3.3-70b',
      'anthropic/claude-3-haiku',
      'openai/gpt-3.5-turbo',
      'mistralai/mistral-7b',
    ],
  },

  // Plan requirements
  plans: {
    free: {
      requiresOwnApiKey: true,
      description: 'Bring your own OpenRouter API key',
    },
    weekly: {
      requiresOwnApiKey: false,
      description: 'We provide API keys',
      price: 10,
      period: 'week',
    },
    monthly: {
      requiresOwnApiKey: false,
      description: 'We provide API keys',
      price: 20,
      period: 'month',
    },
    pro: {
      requiresOwnApiKey: false,
      description: 'We provide API keys',
      price: 100,
      period: 'month',
    },
    enterprise: {
      requiresOwnApiKey: false,
      description: 'Custom solutions',
      price: 'custom',
      period: 'custom',
    },
  },
} as const;

/**
 * Helper to get the correct callback URL based on environment
 */
export function getCallbackUrl(provider: 'github' | 'google' | 'discord'): string {
  const baseUrl = config.urls.web;
  return config.oauth[provider].callbackUrl(baseUrl);
}

/**
 * Helper to get CLI authorization URL
 */
export function getCliAuthUrl(params: {
  state: string;
  redirectUri: string;
  scope?: string;
}): string {
  const url = new URL('/api/auth/cli', config.urls.web);
  url.searchParams.set('client_id', config.cli.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', params.state);
  url.searchParams.set('scope', params.scope || 'cli:full profile');
  return url.toString();
}

/**
 * Helper to get device authorization URL
 */
export function getDeviceAuthUrl(userCode?: string): string {
  const url = new URL('/auth/device', config.urls.web);
  if (userCode) {
    url.searchParams.set('user_code', userCode);
  }
  return url.toString();
}

/**
 * Helper to get API endpoint URL
 */
export function getApiUrl(path: string): string {
  return `${config.urls.api}${path.startsWith('/') ? path : '/' + path}`;
}

/**
 * Helper to get web app URL
 */
export function getWebUrl(path: string = ''): string {
  return `${config.urls.web}${path.startsWith('/') ? path : '/' + path}`;
}

/**
 * Helper to get IDE app URL
 */
export function getAppUrl(path: string = ''): string {
  return `${config.urls.app}${path.startsWith('/') ? path : '/' + path}`;
}

/**
 * Validate required environment variables
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required for production
  if (config.isProduction) {
    if (!config.database.url) {
      errors.push('DATABASE_URL is required in production');
    }
    if (!config.security.jwtSecret) {
      errors.push('JWT_SECRET is required in production');
    }
    if (!config.security.nextAuthSecret) {
      errors.push('NEXTAUTH_SECRET is required in production');
    }
    if (!config.security.apiKeyEncryptionSecret) {
      errors.push('API_KEY_ENCRYPTION_SECRET is required in production');
    }
    if (!config.oauth.github.clientId || !config.oauth.github.clientSecret) {
      errors.push('GitHub OAuth credentials required in production');
    }
    if (!config.oauth.google.clientId || !config.oauth.google.clientSecret) {
      errors.push('Google OAuth credentials required in production');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get configuration summary for debugging
 */
export function getConfigSummary() {
  return {
    environment: config.env,
    urls: {
      web: config.urls.web,
      app: config.urls.app,
      api: config.urls.api,
    },
    features: config.features,
    oauth: {
      github: !!config.oauth.github.clientId,
      google: !!config.oauth.google.clientId,
      discord: !!config.oauth.discord.clientId,
    },
    payment: {
      paddle: !!config.payment.paddle.vendorId,
      dodo: !!config.payment.dodo.apiKey,
    },
    ai: {
      openrouterKeys: config.ai.openrouter.keys.length,
      anthropic: !!config.ai.anthropic.apiKey,
      openai: !!config.ai.openai.apiKey,
    },
  };
}

/**
 * Check if a model is a pricey model
 */
export function isPriceyModel(model: string): boolean {
  return config.models.pricey.some(pm => model.toLowerCase().includes(pm.toLowerCase()));
}

/**
 * Check if a model is a free model
 */
export function isFreeModel(model: string): boolean {
  return config.models.free.some(fm => model.toLowerCase().includes(fm.toLowerCase()));
}

/**
 * Get session limit for a plan
 */
export function getSessionLimit(plan: keyof typeof config.usage.sessionsPerDay): number {
  return config.usage.sessionsPerDay[plan] || config.usage.sessionsPerDay.free;
}

/**
 * Get pricey token limit per session for a plan
 */
export function getTokenLimit(plan: keyof typeof config.usage.priceyTokensPerSession): number {
  return config.usage.priceyTokensPerSession[plan] || config.usage.priceyTokensPerSession.free;
}

/**
 * Check if a plan requires own API key
 */
export function requiresOwnApiKey(plan: keyof typeof config.plans): boolean {
  return config.plans[plan]?.requiresOwnApiKey || false;
}

/**
 * Get plan details
 */
export function getPlanDetails(plan: keyof typeof config.plans) {
  return {
    ...config.plans[plan],
    sessionsPerDay: getSessionLimit(plan),
    priceyTokensPerSession: getTokenLimit(plan),
  };
}

export default config;
