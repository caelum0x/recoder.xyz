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
export declare const LSP_SERVER_CONFIGS: Record<string, LSPServerConfig>;
/**
 * Port range reserved for LSP servers
 * 9001-9010 inside containers
 */
export declare const LSP_PORT_RANGE: {
    start: number;
    end: number;
};
/**
 * Default LSP client configuration
 */
export declare const LSP_CLIENT_CONFIG: {
    /** Connection timeout in ms */
    connectionTimeoutMs: number;
    /** Reconnection delay in ms */
    reconnectDelayMs: number;
    /** Max reconnection attempts */
    maxReconnectAttempts: number;
    /** Request timeout in ms */
    requestTimeoutMs: number;
    /** Keep-alive interval in ms (send ping) */
    keepAliveIntervalMs: number;
    /** Buffer size for incoming messages */
    maxMessageSizeBytes: number;
};
/**
 * JSON-RPC error codes (LSP standard)
 */
export declare const JSON_RPC_ERRORS: {
    PARSE_ERROR: number;
    INVALID_REQUEST: number;
    METHOD_NOT_FOUND: number;
    INVALID_PARAMS: number;
    INTERNAL_ERROR: number;
    SERVER_NOT_INITIALIZED: number;
    UNKNOWN_ERROR_CODE: number;
    REQUEST_CANCELLED: number;
    CONTENT_MODIFIED: number;
};
/**
 * LSP message types
 */
export declare const LSP_MESSAGE_TYPES: {
    readonly REQUEST: "request";
    readonly RESPONSE: "response";
    readonly NOTIFICATION: "notification";
};
/**
 * Get LSP config for a file extension
 */
export declare function getConfigForExtension(ext: string): LSPServerConfig | null;
/**
 * Get LSP config for a language ID
 */
export declare function getConfigForLanguageId(languageId: string): LSPServerConfig | null;
/**
 * Get all unique ports needed for LSP servers
 */
export declare function getAllLSPPorts(): number[];
/**
 * Validate a JSON-RPC message structure
 */
export declare function isValidJsonRpcMessage(msg: unknown): boolean;
export default LSP_SERVER_CONFIGS;
