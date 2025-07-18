/**
 * Constants and configuration values
 */

export const VERSION = '1.0.0';
export const CLI_NAME = 'recoder';
export const DISPLAY_NAME = 'Recoder';
export const DESCRIPTION = 'AI-powered development platform with production-ready code generation';

// API Configuration
export const API_CONFIG = {
  BASE_URL: 'https://api.recoder.xyz',
  VERSION: 'v1',
  TIMEOUT: 30000,
  RETRIES: 3,
  RATE_LIMIT: {
    REQUESTS_PER_MINUTE: 100,
    REQUESTS_PER_HOUR: 1000,
    REQUESTS_PER_DAY: 10000,
  },
} as const;

// File and Directory Constants
export const PATHS = {
  CONFIG_DIR: '.recoder',
  CONFIG_FILE: 'config.json',
  CACHE_DIR: 'cache',
  TEMPLATES_DIR: 'templates',
  LOGS_DIR: 'logs',
  TEMP_DIR: 'temp',
  PROJECTS_DIR: 'projects',
  BACKUPS_DIR: 'backups',
} as const;

// File Extensions
export const EXTENSIONS = {
  JAVASCRIPT: ['.js', '.mjs', '.cjs'],
  TYPESCRIPT: ['.ts', '.tsx'],
  PYTHON: ['.py', '.pyw'],
  JAVA: ['.java'],
  CSHARP: ['.cs'],
  CPP: ['.cpp', '.cc', '.cxx', '.c++'],
  C: ['.c'],
  GO: ['.go'],
  RUST: ['.rs'],
  PHP: ['.php'],
  RUBY: ['.rb'],
  SWIFT: ['.swift'],
  KOTLIN: ['.kt'],
  DART: ['.dart'],
  HTML: ['.html', '.htm'],
  CSS: ['.css'],
  SCSS: ['.scss'],
  SASS: ['.sass'],
  LESS: ['.less'],
  JSON: ['.json'],
  YAML: ['.yaml', '.yml'],
  XML: ['.xml'],
  MARKDOWN: ['.md', '.markdown'],
  SHELL: ['.sh', '.bash', '.zsh'],
  SQL: ['.sql'],
  CONFIG: ['.config', '.conf', '.ini', '.env'],
  LOCK: ['.lock'],
  IGNORE: ['.gitignore', '.dockerignore', '.npmignore'],
} as const;

// Template Categories
export const TEMPLATE_CATEGORIES = {
  WEB: 'web',
  MOBILE: 'mobile',
  API: 'api',
  LIBRARY: 'library',
  FULLSTACK: 'fullstack',
  BLOCKCHAIN: 'blockchain',
  AI: 'ai',
  DESKTOP: 'desktop',
  GAME: 'game',
  IOT: 'iot',
  MICROSERVICE: 'microservice',
  PLUGIN: 'plugin',
} as const;

// Framework Categories
export const FRAMEWORK_TYPES = {
  FRONTEND: 'frontend',
  BACKEND: 'backend',
  FULLSTACK: 'fullstack',
  MOBILE: 'mobile',
  DESKTOP: 'desktop',
  LIBRARY: 'library',
  DATABASE: 'database',
  TESTING: 'testing',
  BUILD: 'build',
  DEPLOYMENT: 'deployment',
} as const;

// Common Frameworks
export const FRAMEWORKS = {
  FRONTEND: [
    'React',
    'Vue.js',
    'Angular',
    'Svelte',
    'Next.js',
    'Nuxt.js',
    'Gatsby',
    'Remix',
    'SvelteKit',
    'Astro',
    'Solid.js',
    'Lit',
    'Stencil',
    'Alpine.js',
    'Preact',
  ],
  BACKEND: [
    'Express.js',
    'FastAPI',
    'Django',
    'Flask',
    'NestJS',
    'Fastify',
    'Koa',
    'Hapi',
    'Spring Boot',
    'Laravel',
    'Ruby on Rails',
    'ASP.NET Core',
    'Phoenix',
    'Gin',
    'Actix',
  ],
  MOBILE: [
    'React Native',
    'Flutter',
    'Ionic',
    'Cordova',
    'Xamarin',
    'NativeScript',
    'Capacitor',
    'Expo',
    'Quasar',
    'Framework7',
  ],
  DATABASE: [
    'PostgreSQL',
    'MySQL',
    'MongoDB',
    'Redis',
    'SQLite',
    'Cassandra',
    'DynamoDB',
    'Firestore',
    'Supabase',
    'PlanetScale',
    'Prisma',
    'TypeORM',
    'Sequelize',
    'Mongoose',
  ],
} as const;

// Package Managers
export const PACKAGE_MANAGERS = {
  NODE: ['npm', 'yarn', 'pnpm', 'bun'],
  PYTHON: ['pip', 'pipenv', 'poetry', 'conda'],
  JAVA: ['maven', 'gradle'],
  RUST: ['cargo'],
  GO: ['go'],
  PHP: ['composer'],
  RUBY: ['bundler', 'gem'],
  CSHARP: ['nuget'],
  SWIFT: ['swift'],
  DART: ['pub'],
} as const;

// Build Tools
export const BUILD_TOOLS = {
  BUNDLERS: ['webpack', 'vite', 'rollup', 'parcel', 'esbuild', 'turbo'],
  COMPILERS: ['tsc', 'babel', 'swc', 'sucrase'],
  TASK_RUNNERS: ['gulp', 'grunt', 'npm-scripts'],
  PREPROCESSORS: ['sass', 'less', 'stylus', 'postcss'],
  LINTERS: ['eslint', 'prettier', 'stylelint', 'htmlhint'],
  TESTERS: ['jest', 'vitest', 'cypress', 'playwright', 'mocha', 'jasmine'],
} as const;

// Cloud Providers
export const CLOUD_PROVIDERS = {
  HOSTING: ['Vercel', 'Netlify', 'AWS', 'Azure', 'Google Cloud', 'Heroku', 'Railway', 'Render'],
  DATABASES: ['AWS RDS', 'Azure SQL', 'Google Cloud SQL', 'PlanetScale', 'Supabase', 'MongoDB Atlas'],
  STORAGE: ['AWS S3', 'Azure Blob', 'Google Cloud Storage', 'Cloudinary', 'UploadCare'],
  CDN: ['CloudFlare', 'AWS CloudFront', 'Azure CDN', 'Google Cloud CDN', 'KeyCDN'],
} as const;

// Integration Categories
export const INTEGRATION_CATEGORIES = {
  AUTHENTICATION: 'authentication',
  PAYMENT: 'payment',
  DATABASE: 'database',
  STORAGE: 'storage',
  EMAIL: 'email',
  SMS: 'sms',
  PUSH_NOTIFICATIONS: 'push-notifications',
  ANALYTICS: 'analytics',
  MONITORING: 'monitoring',
  SEARCH: 'search',
  AI: 'ai',
  BLOCKCHAIN: 'blockchain',
  SOCIAL: 'social',
  MAPS: 'maps',
  WEATHER: 'weather',
  FINANCE: 'finance',
  E_COMMERCE: 'e-commerce',
  CRM: 'crm',
  CMS: 'cms',
  DEPLOYMENT: 'deployment',
} as const;

// Common Integrations
export const INTEGRATIONS = {
  AUTHENTICATION: [
    'Auth0',
    'Firebase Auth',
    'Supabase Auth',
    'Clerk',
    'NextAuth.js',
    'Passport.js',
    'OAuth',
    'SAML',
    'LDAP',
    'JWT',
  ],
  PAYMENT: [
    'Stripe',
    'PayPal',
    'Square',
    'Braintree',
    'Razorpay',
    'Paddle',
    'Lemon Squeezy',
    'Chargebee',
    'Recurly',
    'Adyen',
  ],
  EMAIL: [
    'SendGrid',
    'Mailgun',
    'AWS SES',
    'Resend',
    'Postmark',
    'Mailchimp',
    'ConvertKit',
    'EmailJS',
    'Nodemailer',
  ],
  ANALYTICS: [
    'Google Analytics',
    'Mixpanel',
    'Amplitude',
    'Segment',
    'Posthog',
    'Plausible',
    'Fathom',
    'Hotjar',
    'Heap',
  ],
  MONITORING: [
    'Sentry',
    'DataDog',
    'New Relic',
    'Bugsnag',
    'LogRocket',
    'Rollbar',
    'Honeybadger',
    'Raygun',
  ],
  AI: [
    'OpenAI',
    'Anthropic',
    'Cohere',
    'Hugging Face',
    'Google AI',
    'AWS Bedrock',
    'Azure OpenAI',
    'Replicate',
    'Stability AI',
  ],
} as const;

// Project Types
export const PROJECT_TYPES = {
  WEB: 'web',
  MOBILE: 'mobile',
  DESKTOP: 'desktop',
  API: 'api',
  LIBRARY: 'library',
  MONOREPO: 'monorepo',
  PLUGIN: 'plugin',
  THEME: 'theme',
  BOILERPLATE: 'boilerplate',
  STARTER: 'starter',
  UNKNOWN: 'unknown',
} as const;

// Complexity Levels
export const COMPLEXITY_LEVELS = {
  SIMPLE: 'simple',
  MODERATE: 'moderate',
  COMPLEX: 'complex',
  ENTERPRISE: 'enterprise',
} as const;

// Quality Gates
export const QUALITY_GATES = {
  CODE_COVERAGE: 80,
  MAINTAINABILITY_INDEX: 70,
  COMPLEXITY_THRESHOLD: 10,
  DUPLICATION_THRESHOLD: 5,
  SECURITY_SCORE: 80,
  PERFORMANCE_SCORE: 80,
  ACCESSIBILITY_SCORE: 90,
  SEO_SCORE: 90,
  BEST_PRACTICES_SCORE: 90,
} as const;

// Validation Rules
export const VALIDATION_RULES = {
  PROJECT_NAME: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 100,
    PATTERN: /^[a-zA-Z0-9\-_\s]+$/,
  },
  EMAIL: {
    PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  URL: {
    PATTERN: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  },
  SEMVER: {
    PATTERN: /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
  },
  UUID: {
    PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  },
  SLUG: {
    PATTERN: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  },
  COLOR: {
    HEX: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
    RGB: /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/,
    RGBA: /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[01]?\.?\d*\s*\)$/,
  },
} as const;

// Timeouts and Limits
export const LIMITS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_FILES_PER_PROJECT: 10000,
  MAX_TEMPLATE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_CONCURRENT_GENERATIONS: 5,
  MAX_HISTORY_ENTRIES: 100,
  MAX_CACHE_SIZE: 500 * 1024 * 1024, // 500MB
  MAX_LOG_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_LOG_FILES: 10,
  REQUEST_TIMEOUT: 30000, // 30 seconds
  LONG_REQUEST_TIMEOUT: 300000, // 5 minutes
  WEBSOCKET_TIMEOUT: 60000, // 1 minute
  CACHE_TTL: 3600000, // 1 hour
  SESSION_TIMEOUT: 86400000, // 24 hours
} as const;

// Feature Flags
export const FEATURE_FLAGS = {
  ENABLE_TELEMETRY: true,
  ENABLE_CRASH_REPORTING: true,
  ENABLE_ANALYTICS: true,
  ENABLE_AUTO_UPDATE: true,
  ENABLE_BETA_FEATURES: false,
  ENABLE_EXPERIMENTAL_FEATURES: false,
  ENABLE_DEBUG_MODE: false,
  ENABLE_VERBOSE_LOGGING: false,
  ENABLE_OFFLINE_MODE: false,
  ENABLE_MULTI_LANGUAGE: false,
} as const;

// Environment Variables
export const ENV_VARS = {
  NODE_ENV: 'NODE_ENV',
  PORT: 'PORT',
  HOST: 'HOST',
  API_URL: 'RECODER_API_URL',
  API_KEY: 'RECODER_API_KEY',
  CONFIG_PATH: 'RECODER_CONFIG_PATH',
  CACHE_PATH: 'RECODER_CACHE_PATH',
  LOG_LEVEL: 'RECODER_LOG_LEVEL',
  ENABLE_TELEMETRY: 'RECODER_ENABLE_TELEMETRY',
  ENABLE_ANALYTICS: 'RECODER_ENABLE_ANALYTICS',
  DEBUG: 'RECODER_DEBUG',
  VERBOSE: 'RECODER_VERBOSE',
  OFFLINE: 'RECODER_OFFLINE',
  NO_COLOR: 'NO_COLOR',
  FORCE_COLOR: 'FORCE_COLOR',
  CI: 'CI',
  GITHUB_ACTIONS: 'GITHUB_ACTIONS',
  GITLAB_CI: 'GITLAB_CI',
  JENKINS_URL: 'JENKINS_URL',
  BUILDKITE: 'BUILDKITE',
  CIRCLECI: 'CIRCLECI',
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error occurred. Please check your internet connection.',
  AUTHENTICATION_REQUIRED: 'Authentication required. Please log in.',
  PERMISSION_DENIED: 'Permission denied. You do not have access to this resource.',
  RESOURCE_NOT_FOUND: 'The requested resource was not found.',
  VALIDATION_FAILED: 'Validation failed. Please check your input.',
  INTERNAL_ERROR: 'An internal error occurred. Please try again later.',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please wait before trying again.',
  TIMEOUT: 'Request timed out. Please try again.',
  CANCELLED: 'Operation was cancelled.',
  UNKNOWN_ERROR: 'An unknown error occurred.',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  OPERATION_COMPLETED: 'Operation completed successfully.',
  FILE_CREATED: 'File created successfully.',
  FILE_UPDATED: 'File updated successfully.',
  FILE_DELETED: 'File deleted successfully.',
  PROJECT_CREATED: 'Project created successfully.',
  PROJECT_UPDATED: 'Project updated successfully.',
  PROJECT_DELETED: 'Project deleted successfully.',
  AUTHENTICATION_SUCCESS: 'Authentication successful.',
  CONFIGURATION_SAVED: 'Configuration saved successfully.',
  TEMPLATE_DOWNLOADED: 'Template downloaded successfully.',
  GENERATION_COMPLETE: 'Code generation completed successfully.',
} as const;

// CLI Colors
export const COLORS = {
  PRIMARY: '#3B82F6',
  SUCCESS: '#10B981',
  WARNING: '#F59E0B',
  ERROR: '#EF4444',
  INFO: '#6B7280',
  MUTED: '#9CA3AF',
  ACCENT: '#8B5CF6',
  BACKGROUND: '#F9FAFB',
  FOREGROUND: '#111827',
} as const;

// Default Templates
export const DEFAULT_TEMPLATES = {
  WEB: {
    'nextjs-app': 'Next.js App Router',
    'react-vite': 'React with Vite',
    'vue-vite': 'Vue 3 with Vite',
    'angular-app': 'Angular Application',
    'svelte-kit': 'SvelteKit Application',
  },
  MOBILE: {
    'react-native': 'React Native App',
    'flutter-app': 'Flutter Application',
    'ionic-react': 'Ionic React App',
    'expo-app': 'Expo Application',
  },
  API: {
    'express-api': 'Express.js API',
    'fastapi-app': 'FastAPI Application',
    'nestjs-api': 'NestJS API',
    'django-api': 'Django REST API',
  },
  LIBRARY: {
    'npm-package': 'NPM Package',
    'typescript-lib': 'TypeScript Library',
    'python-package': 'Python Package',
    'rust-crate': 'Rust Crate',
  },
} as const;

// Default Integrations
export const DEFAULT_INTEGRATIONS = {
  AUTHENTICATION: ['auth0', 'firebase-auth', 'supabase-auth'],
  DATABASE: ['postgresql', 'mongodb', 'sqlite'],
  PAYMENT: ['stripe', 'paypal'],
  EMAIL: ['sendgrid', 'resend'],
  ANALYTICS: ['google-analytics', 'mixpanel'],
  MONITORING: ['sentry', 'datadog'],
  DEPLOYMENT: ['vercel', 'netlify', 'aws'],
} as const;

// Keyboard Shortcuts
export const KEYBOARD_SHORTCUTS = {
  QUIT: 'Ctrl+C',
  HELP: 'h',
  BACK: 'Esc',
  CONFIRM: 'Enter',
  CANCEL: 'Esc',
  UP: 'ArrowUp',
  DOWN: 'ArrowDown',
  LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  SELECT: 'Space',
  TOGGLE: 'Tab',
  SEARCH: '/',
  FILTER: 'f',
  SORT: 's',
  REFRESH: 'r',
  EDIT: 'e',
  DELETE: 'd',
  COPY: 'c',
  PASTE: 'v',
  CUT: 'x',
  UNDO: 'z',
  REDO: 'y',
  SAVE: 'Ctrl+S',
  OPEN: 'Ctrl+O',
  NEW: 'Ctrl+N',
  FIND: 'Ctrl+F',
  REPLACE: 'Ctrl+H',
  ZOOM_IN: 'Ctrl+=',
  ZOOM_OUT: 'Ctrl+-',
  RESET_ZOOM: 'Ctrl+0',
  FULLSCREEN: 'F11',
  DEVELOPER_TOOLS: 'F12',
} as const;

// Export all constants as a single object for easier access
export const CONSTANTS = {
  VERSION,
  CLI_NAME,
  DISPLAY_NAME,
  DESCRIPTION,
  API_CONFIG,
  PATHS,
  EXTENSIONS,
  TEMPLATE_CATEGORIES,
  FRAMEWORK_TYPES,
  FRAMEWORKS,
  PACKAGE_MANAGERS,
  BUILD_TOOLS,
  CLOUD_PROVIDERS,
  INTEGRATION_CATEGORIES,
  INTEGRATIONS,
  PROJECT_TYPES,
  COMPLEXITY_LEVELS,
  QUALITY_GATES,
  VALIDATION_RULES,
  LIMITS,
  FEATURE_FLAGS,
  ENV_VARS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  COLORS,
  DEFAULT_TEMPLATES,
  DEFAULT_INTEGRATIONS,
  KEYBOARD_SHORTCUTS,
} as const;

// Type definitions for constants
export type TemplateCategory = typeof TEMPLATE_CATEGORIES[keyof typeof TEMPLATE_CATEGORIES];
export type FrameworkType = typeof FRAMEWORK_TYPES[keyof typeof FRAMEWORK_TYPES];
export type ProjectType = typeof PROJECT_TYPES[keyof typeof PROJECT_TYPES];
export type ComplexityLevel = typeof COMPLEXITY_LEVELS[keyof typeof COMPLEXITY_LEVELS];
export type IntegrationCategory = typeof INTEGRATION_CATEGORIES[keyof typeof INTEGRATION_CATEGORIES];