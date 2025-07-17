// Constants for CodeCraft platform

/**
 * Default configurations
 */
const DEFAULT_CONFIG = {
  API_URL: 'https://api.codecraft.dev',
  CLI_VERSION: '1.0.0',
  EXTENSION_VERSION: '1.0.0',
  TIMEOUT: 30000,
  MAX_RETRIES: 3,
  LOG_LEVEL: 'info'
};

/**
 * API endpoints
 */
const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    STATUS: '/auth/status'
  },
  AGENTS: {
    LIST: '/agents',
    CREATE: '/agents',
    GET: '/agents/:id',
    UPDATE: '/agents/:id',
    DELETE: '/agents/:id',
    CONFIGURE: '/agents/:id/configure'
  },
  PROJECTS: {
    LIST: '/projects',
    CREATE: '/projects',
    GET: '/projects/:id',
    UPDATE: '/projects/:id',
    DELETE: '/projects/:id',
    PLAN: '/projects/:id/plan',
    GENERATE: '/projects/:id/generate',
    VALIDATE: '/projects/:id/validate'
  },
  PLANNING: {
    CREATE: '/planning/create',
    ANALYZE: '/planning/analyze',
    VALIDATE: '/planning/validate',
    TEMPLATES: '/planning/templates'
  },
  GENERATION: {
    GENERATE: '/generation/generate',
    STATUS: '/generation/:id/status',
    DOWNLOAD: '/generation/:id/download'
  },
  VALIDATION: {
    VALIDATE: '/validation/validate',
    CHECKS: '/validation/checks',
    RESULTS: '/validation/:id/results'
  },
  INTEGRATIONS: {
    LIST: '/integrations',
    PROVIDERS: '/integrations/providers',
    CONFIGURE: '/integrations/configure',
    TEST: '/integrations/test'
  },
  TEMPLATES: {
    LIST: '/templates',
    GET: '/templates/:id',
    CATEGORIES: '/templates/categories'
  },
  MODELS: {
    LIST: '/models',
    CAPABILITIES: '/models/:id/capabilities'
  }
};

/**
 * File extensions and types
 */
const FILE_TYPES = {
  JAVASCRIPT: ['.js', '.mjs'],
  TYPESCRIPT: ['.ts', '.tsx'],
  REACT: ['.jsx', '.tsx'],
  VUE: ['.vue'],
  SVELTE: ['.svelte'],
  HTML: ['.html', '.htm'],
  CSS: ['.css', '.scss', '.sass', '.less'],
  JSON: ['.json'],
  YAML: ['.yml', '.yaml'],
  MARKDOWN: ['.md', '.mdx'],
  PYTHON: ['.py'],
  RUST: ['.rs'],
  GO: ['.go'],
  SOLIDITY: ['.sol'],
  CONFIG: ['.config.js', '.config.ts', '.env', '.env.example']
};

/**
 * Technology stacks by project type
 */
const TECH_STACKS = {
  web: {
    frontend: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
    backend: ['Node.js', 'Express', 'tRPC'],
    database: ['PostgreSQL', 'Prisma'],
    deployment: ['Vercel', 'Railway'],
    testing: ['Jest', 'Playwright'],
    tools: ['ESLint', 'Prettier', 'Husky']
  },
  mobile: {
    framework: ['React Native', 'Expo'],
    language: ['TypeScript'],
    state: ['Redux Toolkit', 'Zustand'],
    navigation: ['React Navigation'],
    testing: ['Jest', 'Detox'],
    deployment: ['EAS Build', 'App Store', 'Google Play']
  },
  blockchain: {
    blockchain: ['Solana', 'Ethereum', 'Polygon'],
    framework: ['Anchor', 'Hardhat', 'Foundry'],
    frontend: ['Next.js', 'React', 'Web3 Modal'],
    wallet: ['Phantom', 'MetaMask', 'WalletConnect'],
    testing: ['Mocha', 'Chai', 'Solana Test Validator'],
    deployment: ['Devnet', 'Mainnet']
  },
  ai: {
    framework: ['LangChain', 'LlamaIndex'],
    models: ['OpenAI', 'Anthropic', 'Hugging Face'],
    backend: ['Python', 'FastAPI', 'Node.js'],
    database: ['PostgreSQL', 'Pinecone', 'Weaviate'],
    processing: ['NumPy', 'Pandas', 'PyTorch'],
    deployment: ['Docker', 'AWS', 'Modal']
  },
  fullstack: {
    frontend: ['React', 'Next.js', 'TypeScript'],
    backend: ['Node.js', 'tRPC', 'Prisma'],
    database: ['PostgreSQL', 'Redis'],
    auth: ['NextAuth.js', 'Clerk', 'Supabase Auth'],
    payment: ['Stripe', 'PayPal'],
    deployment: ['Vercel', 'PlanetScale', 'Upstash'],
    monitoring: ['Sentry', 'LogRocket']
  }
};

/**
 * Integration providers
 */
const INTEGRATION_PROVIDERS = {
  payment: {
    stripe: {
      name: 'Stripe',
      type: 'payment',
      features: ['payments', 'subscriptions', 'marketplace'],
      documentation: 'https://stripe.com/docs'
    },
    paypal: {
      name: 'PayPal',
      type: 'payment',
      features: ['payments', 'subscriptions'],
      documentation: 'https://developer.paypal.com'
    }
  },
  blockchain: {
    solana: {
      name: 'Solana',
      type: 'blockchain',
      features: ['smart-contracts', 'tokens', 'nfts', 'defi'],
      documentation: 'https://docs.solana.com'
    },
    ethereum: {
      name: 'Ethereum',
      type: 'blockchain',
      features: ['smart-contracts', 'tokens', 'nfts', 'defi'],
      documentation: 'https://ethereum.org/developers'
    }
  },
  ai: {
    openai: {
      name: 'OpenAI',
      type: 'ai',
      features: ['chat', 'completion', 'embeddings', 'vision'],
      documentation: 'https://platform.openai.com/docs'
    },
    anthropic: {
      name: 'Anthropic',
      type: 'ai',
      features: ['chat', 'completion', 'analysis'],
      documentation: 'https://docs.anthropic.com'
    }
  },
  database: {
    postgresql: {
      name: 'PostgreSQL',
      type: 'database',
      features: ['relational', 'acid', 'json', 'full-text-search'],
      documentation: 'https://www.postgresql.org/docs'
    },
    mongodb: {
      name: 'MongoDB',
      type: 'database',
      features: ['document', 'scalable', 'flexible-schema'],
      documentation: 'https://docs.mongodb.com'
    }
  },
  cloud: {
    aws: {
      name: 'Amazon Web Services',
      type: 'cloud',
      features: ['compute', 'storage', 'database', 'ai', 'deployment'],
      documentation: 'https://docs.aws.amazon.com'
    },
    vercel: {
      name: 'Vercel',
      type: 'deployment',
      features: ['hosting', 'serverless', 'edge', 'domains'],
      documentation: 'https://vercel.com/docs'
    }
  }
};

/**
 * Validation criteria
 */
const VALIDATION_CRITERIA = {
  functionality: {
    name: 'Functional Requirements',
    description: 'All specified features work as expected',
    automated: true,
    critical: true
  },
  integration: {
    name: 'Integration Functionality',
    description: 'All external integrations work correctly',
    automated: true,
    critical: true
  },
  performance: {
    name: 'Performance Standards',
    description: 'Application meets performance requirements',
    automated: true,
    critical: false,
    thresholds: {
      loadTime: 3000, // ms
      apiResponse: 500, // ms
      firstContentfulPaint: 1500 // ms
    }
  },
  security: {
    name: 'Security Compliance',
    description: 'Security best practices implemented',
    automated: true,
    critical: true,
    checks: [
      'authentication',
      'authorization',
      'input-validation',
      'secure-communication',
      'data-encryption'
    ]
  },
  production: {
    name: 'Production Readiness',
    description: 'Application ready for production deployment',
    automated: false,
    critical: true,
    checklist: [
      'error-handling',
      'logging',
      'monitoring',
      'scalability',
      'backup-recovery'
    ]
  }
};

/**
 * Error codes
 */
const ERROR_CODES = {
  // Authentication errors
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  
  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Generation errors
  GENERATION_FAILED: 'GENERATION_FAILED',
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
  
  // System errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Project errors
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PROJECT_ALREADY_EXISTS: 'PROJECT_ALREADY_EXISTS',
  INVALID_PROJECT_TYPE: 'INVALID_PROJECT_TYPE',
  
  // Agent errors
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  AGENT_CREATION_FAILED: 'AGENT_CREATION_FAILED',
  INVALID_AGENT_TYPE: 'INVALID_AGENT_TYPE'
};

/**
 * Default timeouts (in milliseconds)
 */
const TIMEOUTS = {
  API_REQUEST: 30000,
  PLANNING: 120000,
  GENERATION: 300000,
  VALIDATION: 60000,
  INTEGRATION_TEST: 30000
};

/**
 * Rate limits
 */
const RATE_LIMITS = {
  API_REQUESTS_PER_MINUTE: 60,
  PLANNING_REQUESTS_PER_HOUR: 10,
  GENERATION_REQUESTS_PER_HOUR: 5,
  VALIDATION_REQUESTS_PER_HOUR: 20
};

/**
 * Environment variables
 */
const ENV_VARS = {
  API_URL: 'CODECRAFT_API_URL',
  API_KEY: 'CODECRAFT_API_KEY',
  LOG_LEVEL: 'CODECRAFT_LOG_LEVEL',
  TIMEOUT: 'CODECRAFT_TIMEOUT',
  DISABLE_TELEMETRY: 'CODECRAFT_DISABLE_TELEMETRY'
};

module.exports = {
  DEFAULT_CONFIG,
  API_ENDPOINTS,
  FILE_TYPES,
  TECH_STACKS,
  INTEGRATION_PROVIDERS,
  VALIDATION_CRITERIA,
  ERROR_CODES,
  TIMEOUTS,
  RATE_LIMITS,
  ENV_VARS
};