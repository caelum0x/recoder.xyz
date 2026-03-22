// Application Configuration for Recoder Web
// This file contains all configurable settings for the application

export const appConfig = {
  // Docker Sandbox Configuration (recoder-web uses Docker containers)
  dockerSandbox: {
    // Sandbox timeout in minutes
    timeoutMinutes: 30,

    // Convert to milliseconds for Docker API
    get timeoutMs() {
      return this.timeoutMinutes * 60 * 1000;
    },

    // Development server port (Vite uses 5173 by default)
    devPort: 5173,

    // Time to wait for dev server to be ready (in milliseconds)
    devServerStartupDelay: 10000,

    // Time to wait for CSS rebuild (in milliseconds)
    cssRebuildDelay: 2000,

    // Working directory in sandbox
    workingDirectory: '/app',

    // WebSocket connection timeout (milliseconds)
    wsConnectionTimeout: 30000,

    // File watcher debounce delay (milliseconds)
    fileWatcherDebounce: 100,
  },

  // Vercel Sandbox Configuration (for Vercel deployment compatibility)
  vercelSandbox: {
    // Sandbox timeout in minutes
    timeoutMinutes: 15,

    // Convert to milliseconds for Vercel Sandbox API
    get timeoutMs() {
      return this.timeoutMinutes * 60 * 1000;
    },

    // Development server port (Vercel Sandbox typically uses 3000 for Next.js/React)
    devPort: 3000,

    // Time to wait for dev server to be ready (in milliseconds)
    devServerStartupDelay: 7000,

    // Time to wait for CSS rebuild (in milliseconds)
    cssRebuildDelay: 2000,

    // Working directory in sandbox
    workingDirectory: '/app',

    // Default runtime for sandbox
    runtime: 'node22', // Available: node22, python3.13, v0-next-shadcn, cua-ubuntu-xfce
  },

  // E2B Sandbox Configuration (for E2B cloud sandboxes)
  e2b: {
    // Sandbox timeout in minutes
    timeoutMinutes: 30,

    // Convert to milliseconds for E2B API
    get timeoutMs() {
      return this.timeoutMinutes * 60 * 1000;
    },

    // Development server port (E2B uses 5173 for Vite)
    vitePort: 5173,

    // Time to wait for Vite dev server to be ready (in milliseconds)
    viteStartupDelay: 10000,

    // Working directory in sandbox
    workingDirectory: '/home/user/app',
  },

  // AI Model Configuration
  ai: {
    // Default AI model (via OpenRouter)
    defaultModel: 'openai/gpt-4o-mini',

    // Available models (OpenRouter model IDs)
    availableModels: [
      'openai/gpt-4o-mini',
      'google/gemini-2.0-flash-exp:free',
      'google/gemini-2.5-flash-preview-05-20',
      'anthropic/claude-3.5-haiku',
      'anthropic/claude-sonnet-4-20250514',
      'openai/gpt-4o',
      'deepseek/deepseek-chat',
      'x-ai/grok-code-fast-1',
    ],

    // Model display names for UI
    modelDisplayNames: {
      'openai/gpt-4o-mini': 'GPT-4o Mini (128K)',
      'google/gemini-2.0-flash-exp:free': 'Gemini 2.0 Flash (Free)',
      'google/gemini-2.5-flash-preview-05-20': 'Gemini 2.5 Flash',
      'anthropic/claude-3.5-haiku': 'Claude 3.5 Haiku (200K)',
      'anthropic/claude-sonnet-4-20250514': 'Claude Sonnet 4',
      'openai/gpt-4o': 'GPT-4o',
      'deepseek/deepseek-chat': 'DeepSeek Chat',
      'x-ai/grok-code-fast-1': 'Grok Code Fast',
    } as Record<string, string>,

    // Model API configuration (for provider-specific routing)
    modelApiConfig: {
      'google/gemini-2.0-flash-exp:free': {
        provider: 'openrouter',
        supportsFreeUsage: true,
      },
    } as Record<string, { provider: string; supportsFreeUsage?: boolean; model?: string }>,

    // Temperature settings for non-reasoning models
    defaultTemperature: 0.7,

    // Max tokens for code generation
    maxTokens: 8000,

    // Max tokens for truncation recovery
    truncationRecoveryMaxTokens: 4000,

    // System prompt caching (reduce API costs)
    enableSystemPromptCaching: true,
  },

  // Code Application Configuration
  codeApplication: {
    // Delay after applying code before refreshing iframe (milliseconds)
    defaultRefreshDelay: 2000,

    // Delay when packages are installed (milliseconds)
    packageInstallRefreshDelay: 5000,

    // Enable/disable automatic truncation recovery
    enableTruncationRecovery: false, // Disabled - too many false positives

    // Maximum number of truncation recovery attempts per file
    maxTruncationRecoveryAttempts: 1,

    // File write timeout (milliseconds)
    fileWriteTimeout: 30000,

    // Action execution timeout (milliseconds)
    actionExecutionTimeout: 120000,
  },

  // UI Configuration
  ui: {
    // Show/hide certain UI elements
    showModelSelector: true,
    showStatusIndicator: true,
    showConnectionStatus: true,

    // Animation durations (milliseconds)
    animationDuration: 200,

    // Toast notification duration (milliseconds)
    toastDuration: 3000,

    // Maximum chat messages to keep in memory
    maxChatMessages: 100,

    // Maximum recent messages to send as context
    maxRecentMessagesContext: 20,

    // Editor preferences
    editor: {
      tabSize: 2,
      insertSpaces: true,
      wordWrap: 'on' as const,
      minimap: false,
      lineNumbers: true,
    },
  },

  // Development Configuration
  dev: {
    // Enable debug logging
    enableDebugLogging: process.env.NODE_ENV !== 'production',

    // Enable performance monitoring
    enablePerformanceMonitoring: false,

    // Log API responses
    logApiResponses: process.env.NODE_ENV !== 'production',

    // Enable hot reload for sandbox
    enableHotReload: true,
  },

  // Package Installation Configuration
  packages: {
    // Use --legacy-peer-deps flag for npm install
    useLegacyPeerDeps: true,

    // Package installation timeout (milliseconds)
    installTimeout: 60000,

    // Auto-restart dev server after package installation
    autoRestartDevServer: true,

    // Default package manager
    defaultPackageManager: 'npm' as 'npm' | 'yarn' | 'pnpm',
  },

  // File Management Configuration
  files: {
    // Excluded file patterns (files to ignore)
    excludePatterns: [
      'node_modules/**',
      '.git/**',
      '.next/**',
      'dist/**',
      'build/**',
      '*.log',
      '.DS_Store',
      '.env',
      '.env.local',
      '*.lock',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
    ],

    // Maximum file size to read (bytes)
    maxFileSize: 1024 * 1024, // 1MB

    // Maximum file size to display in editor (bytes)
    maxEditorFileSize: 512 * 1024, // 512KB

    // File extensions to treat as text
    textFileExtensions: [
      '.js', '.jsx', '.ts', '.tsx',
      '.css', '.scss', '.sass', '.less',
      '.html', '.xml', '.svg',
      '.json', '.yml', '.yaml',
      '.md', '.txt', '.env',
      '.gitignore', '.dockerignore',
      '.eslintrc', '.prettierrc',
      '.editorconfig',
    ],

    // Binary file extensions (skip reading)
    binaryFileExtensions: [
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
      '.woff', '.woff2', '.ttf', '.eot',
      '.pdf', '.zip', '.tar', '.gz',
      '.mp3', '.mp4', '.wav', '.ogg',
    ],
  },

  // API Endpoints Configuration (for external services)
  api: {
    // Retry configuration
    maxRetries: 3,
    retryDelay: 1000, // milliseconds

    // Request timeout (milliseconds)
    requestTimeout: 30000,

    // OpenRouter API base URL
    openRouterBaseUrl: 'https://openrouter.ai/api/v1',

    // Docker backend default port
    dockerBackendPort: 3001,
  },

  // LSP Configuration
  lsp: {
    // Enable LSP features
    enabled: true,

    // Diagnostic debounce delay (milliseconds)
    diagnosticDebounce: 500,

    // Auto-completion delay (milliseconds)
    autoCompleteDelay: 150,

    // Maximum diagnostics to show per file
    maxDiagnosticsPerFile: 100,
  },

  // Preview Configuration
  preview: {
    // Default preview refresh mode
    refreshMode: 'auto' as 'auto' | 'manual',

    // Iframe sandbox attributes
    sandboxAttributes: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals',

    // Preview loading timeout (milliseconds)
    loadingTimeout: 30000,
  },
};

// Type for the complete configuration
export type AppConfig = typeof appConfig;

// Type-safe config getter
export function getConfig<K extends keyof AppConfig>(key: K): AppConfig[K] {
  return appConfig[key];
}

// Helper to get nested config values
export function getConfigValue(path: string): unknown {
  return path.split('.').reduce((obj: unknown, key: string) => {
    if (obj && typeof obj === 'object' && key in obj) {
      return (obj as Record<string, unknown>)[key];
    }
    return undefined;
  }, appConfig as unknown);
}

// Environment-aware config overrides
export function getEnvConfig<K extends keyof AppConfig>(key: K): AppConfig[K] {
  const config = appConfig[key];

  // Apply environment-specific overrides here if needed
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    // Development-specific overrides could go here
  }

  return config;
}

// Export default for convenience
export default appConfig;
