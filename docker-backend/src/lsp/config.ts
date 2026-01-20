/**
 * LSP Server Configuration
 * Defines language servers and their TCP ports for container-based LSP
 */

export interface LSPServerConfig {
  /** Language identifier (e.g., 'typescript', 'python') */
  languageId: string;
  /** Human-readable name */
  name: string;
  /** TCP port the LSP server listens on inside the container */
  port: number;
  /** Command to start the LSP server in TCP mode */
  startCommand: string;
  /** Command to install the LSP server if not present */
  installCommand: string;
  /** File extensions this server handles */
  fileExtensions: string[];
  /** Language IDs this server handles (for LSP protocol) */
  languageIds: string[];
  /** Initialization options to pass to the server */
  initializationOptions?: Record<string, unknown>;
  /** Server capabilities we expect */
  expectedCapabilities?: string[];
  /** Timeout for server startup in ms */
  startupTimeoutMs: number;
  /** Health check command to verify server is running */
  healthCheckCommand: string;
}

/**
 * LSP Server configurations for supported languages
 * Ports 9001-9010 are reserved for LSP servers inside containers
 */
export const LSP_SERVER_CONFIGS: Record<string, LSPServerConfig> = {
  typescript: {
    languageId: 'typescript',
    name: 'TypeScript Language Server',
    port: 9001,
    // typescript-language-server supports --socket mode for TCP
    startCommand: 'typescript-language-server --socket=9001',
    installCommand: 'npm install -g typescript typescript-language-server 2>/dev/null || bun add -g typescript typescript-language-server',
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    languageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    initializationOptions: {
      preferences: {
        includeInlayParameterNameHints: 'all',
        includeInlayPropertyDeclarationTypeHints: true,
        includeInlayFunctionLikeReturnTypeHints: true,
      },
    },
    expectedCapabilities: [
      'textDocumentSync',
      'completionProvider',
      'hoverProvider',
      'definitionProvider',
      'referencesProvider',
      'documentSymbolProvider',
      'codeActionProvider',
      'documentFormattingProvider',
      'renameProvider',
    ],
    startupTimeoutMs: 30000,
    healthCheckCommand: 'pgrep -f "typescript-language-server.*9001" || exit 1',
  },

  python: {
    languageId: 'python',
    name: 'Pyright Language Server',
    port: 9002,
    // pyright supports --socket-port for TCP mode
    startCommand: 'pyright-langserver --socket --port 9002',
    installCommand: 'pip install pyright 2>/dev/null || npm install -g pyright',
    fileExtensions: ['.py', '.pyi'],
    languageIds: ['python'],
    initializationOptions: {
      python: {
        analysis: {
          autoSearchPaths: true,
          useLibraryCodeForTypes: true,
          diagnosticMode: 'workspace',
        },
      },
    },
    expectedCapabilities: [
      'textDocumentSync',
      'completionProvider',
      'hoverProvider',
      'definitionProvider',
      'referencesProvider',
      'documentSymbolProvider',
      'codeActionProvider',
      'renameProvider',
    ],
    startupTimeoutMs: 30000,
    healthCheckCommand: 'pgrep -f "pyright.*9002" || exit 1',
  },

  go: {
    languageId: 'go',
    name: 'gopls Language Server',
    port: 9003,
    // gopls supports -listen flag for TCP mode
    startCommand: 'gopls -listen=:9003 -logfile=/tmp/gopls.log',
    installCommand: 'go install golang.org/x/tools/gopls@latest',
    fileExtensions: ['.go', '.mod', '.sum'],
    languageIds: ['go', 'gomod', 'gosum'],
    initializationOptions: {
      usePlaceholders: true,
      completionDocumentation: true,
    },
    expectedCapabilities: [
      'textDocumentSync',
      'completionProvider',
      'hoverProvider',
      'definitionProvider',
      'referencesProvider',
      'documentSymbolProvider',
      'codeActionProvider',
      'documentFormattingProvider',
      'renameProvider',
    ],
    startupTimeoutMs: 30000,
    healthCheckCommand: 'pgrep -f "gopls.*9003" || exit 1',
  },

  rust: {
    languageId: 'rust',
    name: 'rust-analyzer Language Server',
    port: 9004,
    // rust-analyzer supports --lsp-port for TCP mode
    startCommand: 'rust-analyzer --lsp-port=9004',
    installCommand: 'curl -L https://github.com/rust-analyzer/rust-analyzer/releases/latest/download/rust-analyzer-x86_64-unknown-linux-gnu.gz | gunzip -c - > /usr/local/bin/rust-analyzer && chmod +x /usr/local/bin/rust-analyzer',
    fileExtensions: ['.rs', '.toml'],
    languageIds: ['rust'],
    initializationOptions: {
      cargo: {
        loadOutDirsFromCheck: true,
      },
      procMacro: {
        enable: true,
      },
    },
    expectedCapabilities: [
      'textDocumentSync',
      'completionProvider',
      'hoverProvider',
      'definitionProvider',
      'referencesProvider',
      'documentSymbolProvider',
      'codeActionProvider',
      'documentFormattingProvider',
      'renameProvider',
    ],
    startupTimeoutMs: 60000, // Rust analyzer takes longer to start
    healthCheckCommand: 'pgrep -f "rust-analyzer.*9004" || exit 1',
  },
};

/**
 * Port range reserved for LSP servers
 * 9001-9010 inside containers
 */
export const LSP_PORT_RANGE = {
  start: 9001,
  end: 9010,
};

/**
 * Default LSP client configuration
 */
export const LSP_CLIENT_CONFIG = {
  /** Connection timeout in ms */
  connectionTimeoutMs: 10000,
  /** Reconnection delay in ms */
  reconnectDelayMs: 2000,
  /** Max reconnection attempts */
  maxReconnectAttempts: 5,
  /** Request timeout in ms */
  requestTimeoutMs: 30000,
  /** Keep-alive interval in ms (send ping) */
  keepAliveIntervalMs: 30000,
  /** Buffer size for incoming messages */
  maxMessageSizeBytes: 10 * 1024 * 1024, // 10MB
};

/**
 * JSON-RPC error codes (LSP standard)
 */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_NOT_INITIALIZED: -32002,
  UNKNOWN_ERROR_CODE: -32001,
  REQUEST_CANCELLED: -32800,
  CONTENT_MODIFIED: -32801,
};

/**
 * LSP message types
 */
export const LSP_MESSAGE_TYPES = {
  REQUEST: 'request',
  RESPONSE: 'response',
  NOTIFICATION: 'notification',
} as const;

/**
 * Get LSP config for a file extension
 */
export function getConfigForExtension(ext: string): LSPServerConfig | null {
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;

  for (const config of Object.values(LSP_SERVER_CONFIGS)) {
    if (config.fileExtensions.includes(normalizedExt)) {
      return config;
    }
  }

  return null;
}

/**
 * Get LSP config for a language ID
 */
export function getConfigForLanguageId(languageId: string): LSPServerConfig | null {
  for (const config of Object.values(LSP_SERVER_CONFIGS)) {
    if (config.languageIds.includes(languageId)) {
      return config;
    }
  }

  return null;
}

/**
 * Get all unique ports needed for LSP servers
 */
export function getAllLSPPorts(): number[] {
  return Object.values(LSP_SERVER_CONFIGS).map(c => c.port);
}

/**
 * Validate a JSON-RPC message structure
 */
export function isValidJsonRpcMessage(msg: unknown): boolean {
  if (typeof msg !== 'object' || msg === null) {
    return false;
  }

  const obj = msg as Record<string, unknown>;

  // Must have jsonrpc version
  if (obj.jsonrpc !== '2.0') {
    return false;
  }

  // Request: has method and id
  // Notification: has method, no id
  // Response: has id and (result or error)

  const hasMethod = typeof obj.method === 'string';
  const hasId = 'id' in obj;
  const hasResult = 'result' in obj;
  const hasError = 'error' in obj;

  if (hasMethod && hasId) {
    // Request
    return true;
  }

  if (hasMethod && !hasId) {
    // Notification
    return true;
  }

  if (hasId && (hasResult || hasError)) {
    // Response
    return true;
  }

  return false;
}

export default LSP_SERVER_CONFIGS;
