/**
 * TCP LSP Client
 * Connects to LSP servers running inside containers via TCP
 * Implements JSON-RPC 2.0 over LSP's Content-Length framing protocol
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import {
  LSPServerConfig,
  LSP_CLIENT_CONFIG,
  JSON_RPC_ERRORS,
  isValidJsonRpcMessage,
} from './config.js';

// ==================== Types ====================

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  method: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

// ==================== LSP Message Parser ====================

/**
 * Parses LSP protocol messages with Content-Length headers
 * Format: "Content-Length: N\r\n\r\n{JSON payload}"
 */
class LSPMessageParser {
  private buffer: Buffer = Buffer.alloc(0);
  private contentLength: number = -1;
  private readonly HEADER_DELIMITER = '\r\n\r\n';
  private readonly MAX_HEADER_SIZE = 1024; // 1KB for headers
  private readonly MAX_BUFFER_SIZE = 100 * 1024 * 1024; // 100MB max buffer
  private parseErrorCount: number = 0;
  private readonly MAX_PARSE_ERRORS = 10;

  /**
   * Feed data into the parser and extract complete messages
   */
  parse(data: Buffer): { messages: JsonRpcMessage[]; error?: Error } {
    // Prevent buffer overflow attacks
    if (this.buffer.length + data.length > this.MAX_BUFFER_SIZE) {
      const error = new Error(`Buffer overflow: size would exceed ${this.MAX_BUFFER_SIZE} bytes`);
      console.error('[LSP Parser]', error.message);
      this.reset();
      return { messages: [], error };
    }

    this.buffer = Buffer.concat([this.buffer, data]);
    const messages: JsonRpcMessage[] = [];

    // Parse all available complete messages
    while (true) {
      const result = this.tryParseMessage();

      if (result.error) {
        this.parseErrorCount++;
        console.error('[LSP Parser] Parse error:', result.error.message);

        // Too many parse errors - reset to recover
        if (this.parseErrorCount >= this.MAX_PARSE_ERRORS) {
          console.error('[LSP Parser] Too many parse errors, resetting parser');
          this.reset();
          this.parseErrorCount = 0;
          return { messages, error: new Error('Too many parse errors') };
        }

        // Try to recover by skipping to next potential message
        this.recoverFromError();
        continue;
      }

      if (result.message === null) {
        break; // No more complete messages
      }

      messages.push(result.message);
      this.parseErrorCount = 0; // Reset error count on successful parse
    }

    return { messages };
  }

  private tryParseMessage(): { message: JsonRpcMessage | null; error?: Error } {
    // If we don't have content length yet, try to parse headers
    if (this.contentLength === -1) {
      const headerEnd = this.buffer.indexOf(this.HEADER_DELIMITER);

      // Check if we're still waiting for complete headers
      if (headerEnd === -1) {
        // Prevent header overflow
        if (this.buffer.length > this.MAX_HEADER_SIZE) {
          return {
            message: null,
            error: new Error(`Header too large: ${this.buffer.length} bytes`)
          };
        }
        return { message: null }; // Headers not complete yet
      }

      // Validate header size
      if (headerEnd > this.MAX_HEADER_SIZE) {
        return {
          message: null,
          error: new Error(`Header exceeds max size: ${headerEnd} bytes`)
        };
      }

      const headerBytes = this.buffer.slice(0, headerEnd);
      let headers: string;

      try {
        headers = headerBytes.toString('utf-8');
      } catch (e) {
        return { message: null, error: new Error('Invalid UTF-8 in headers') };
      }

      // Parse Content-Length header (case-insensitive, multiple formats)
      const contentLengthMatch = headers.match(/Content-Length:\s*(\d+)/i);

      if (!contentLengthMatch) {
        return {
          message: null,
          error: new Error('No Content-Length header found')
        };
      }

      this.contentLength = parseInt(contentLengthMatch[1], 10);

      // Validate content length
      if (isNaN(this.contentLength) || this.contentLength < 0) {
        return {
          message: null,
          error: new Error(`Invalid Content-Length: ${contentLengthMatch[1]}`)
        };
      }

      if (this.contentLength > LSP_CLIENT_CONFIG.maxMessageSizeBytes) {
        return {
          message: null,
          error: new Error(`Message too large: ${this.contentLength} bytes`)
        };
      }

      // Move past the headers
      this.buffer = this.buffer.slice(headerEnd + this.HEADER_DELIMITER.length);
    }

    // Check if we have the full content
    if (this.buffer.length < this.contentLength) {
      return { message: null }; // Content not complete yet
    }

    // Extract the content
    const contentBytes = this.buffer.slice(0, this.contentLength);
    this.buffer = this.buffer.slice(this.contentLength);
    const expectedLength = this.contentLength;
    this.contentLength = -1;

    let content: string;
    try {
      content = contentBytes.toString('utf-8');
    } catch (e) {
      return {
        message: null,
        error: new Error(`Invalid UTF-8 in content (${expectedLength} bytes)`)
      };
    }

    // Verify content length matches
    if (Buffer.byteLength(content, 'utf-8') !== expectedLength) {
      return {
        message: null,
        error: new Error('Content length mismatch')
      };
    }

    let message: unknown;
    try {
      message = JSON.parse(content);
    } catch (e) {
      return {
        message: null,
        error: new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'unknown'}`)
      };
    }

    if (!isValidJsonRpcMessage(message)) {
      return {
        message: null,
        error: new Error('Invalid JSON-RPC message structure')
      };
    }

    return { message: message as JsonRpcMessage };
  }

  /**
   * Attempt to recover from parse error by finding next valid message start
   */
  private recoverFromError(): void {
    // Try to find next Content-Length header
    const contentLengthIndex = this.buffer.indexOf('Content-Length:', 1, 'utf-8');

    if (contentLengthIndex > 0) {
      console.log(`[LSP Parser] Recovering: skipping ${contentLengthIndex} bytes to next header`);
      this.buffer = this.buffer.slice(contentLengthIndex);
    } else {
      // Can't find next header, clear buffer
      console.log('[LSP Parser] Recovering: clearing buffer');
      this.buffer = Buffer.alloc(0);
    }

    this.contentLength = -1;
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.buffer = Buffer.alloc(0);
    this.contentLength = -1;
    this.parseErrorCount = 0;
  }

  /**
   * Get parser statistics
   */
  getStats(): { bufferSize: number; parseErrorCount: number } {
    return {
      bufferSize: this.buffer.length,
      parseErrorCount: this.parseErrorCount,
    };
  }
}

// ==================== TCP LSP Client ====================

export interface TCPLSPClientEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  notification: (method: string, params: unknown) => void;
  request: (id: number | string, method: string, params: unknown) => void;
  initialized: () => void;
}

export interface TCPLSPClientOptions {
  host: string;
  port: number;
  config: LSPServerConfig;
  workspaceRoot: string;
  projectId: string;
  /** Optional: specific container ID for logging */
  containerId?: string;
}

export class TCPLSPClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private parser: LSPMessageParser;
  private pendingRequests: Map<number | string, PendingRequest> = new Map();
  private requestId: number = 1;
  private connected: boolean = false;
  private initialized: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private serverCapabilities: unknown = null;
  private autoReconnect: boolean = true;
  private destroyed: boolean = false;
  private lastActivityTime: number = Date.now();
  private connectionErrorCount: number = 0;
  private readonly MAX_CONNECTION_ERRORS = 5;

  private readonly host: string;
  private readonly port: number;
  private readonly config: LSPServerConfig;
  private readonly workspaceRoot: string;
  private readonly projectId: string;
  private readonly containerId: string;

  constructor(options: TCPLSPClientOptions) {
    super();
    this.host = options.host;
    this.port = options.port;
    this.config = options.config;
    this.workspaceRoot = options.workspaceRoot;
    this.projectId = options.projectId;
    this.containerId = options.containerId || 'unknown';
    this.parser = new LSPMessageParser();
  }

  /**
   * Connect to the LSP server
   */
  async connect(): Promise<void> {
    if (this.destroyed) {
      throw new Error('Client has been destroyed');
    }

    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.connectionErrorCount++;
        this.cleanup();
        reject(new Error(`Connection timeout after ${LSP_CLIENT_CONFIG.connectionTimeoutMs}ms`));
      }, LSP_CLIENT_CONFIG.connectionTimeoutMs);

      this.socket = new net.Socket();

      // Configure socket options for better reliability
      this.socket.setKeepAlive(true, 30000); // 30 seconds
      this.socket.setNoDelay(true); // Disable Nagle's algorithm for lower latency

      this.socket.on('connect', () => {
        clearTimeout(timeoutHandle);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.connectionErrorCount = 0;
        this.lastActivityTime = Date.now();
        console.log(`[LSP ${this.config.languageId}] Connected to ${this.host}:${this.port} for project ${this.projectId}`);
        this.emit('connected');
        this.startKeepAlive();
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        this.lastActivityTime = Date.now();
        this.handleData(data);
      });

      this.socket.on('error', (error: Error) => {
        clearTimeout(timeoutHandle);
        this.connectionErrorCount++;
        console.error(`[LSP ${this.config.languageId}] Socket error (${this.connectionErrorCount}/${this.MAX_CONNECTION_ERRORS}):`, error.message);
        this.emit('error', error);

        if (!this.connected) {
          reject(error);
        } else if (this.connectionErrorCount >= this.MAX_CONNECTION_ERRORS) {
          console.error(`[LSP ${this.config.languageId}] Too many connection errors, forcing disconnect`);
          this.socket?.destroy();
        }
      });

      this.socket.on('close', (hadError: boolean) => {
        const wasConnected = this.connected;
        this.cleanup();

        if (wasConnected) {
          const reason = hadError ? 'Connection closed with error' : 'Connection closed';
          console.log(`[LSP ${this.config.languageId}] ${reason} for project ${this.projectId}`);
          this.emit('disconnected', reason);

          if (this.autoReconnect && !this.destroyed) {
            this.scheduleReconnect();
          }
        }
      });

      this.socket.on('timeout', () => {
        const idleTime = Date.now() - this.lastActivityTime;
        console.warn(`[LSP ${this.config.languageId}] Socket timeout (idle for ${idleTime}ms)`);

        // Only destroy if truly idle
        if (idleTime > 120000) { // 2 minutes
          console.warn(`[LSP ${this.config.languageId}] Destroying idle socket`);
          this.socket?.destroy();
        }
      });

      // Set socket timeout (2 minutes)
      this.socket.setTimeout(120000);

      // Connect with error handling
      try {
        this.socket.connect(this.port, this.host);
      } catch (error) {
        clearTimeout(timeoutHandle);
        this.connectionErrorCount++;
        reject(error);
      }
    });
  }

  /**
   * Initialize the LSP server connection
   */
  async initialize(): Promise<unknown> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    if (this.initialized) {
      return this.serverCapabilities;
    }

    // LSP Initialize request
    const initResult = await this.sendRequest('initialize', {
      processId: process.pid,
      clientInfo: {
        name: 'recoder-lsp-client',
        version: '1.0.0',
      },
      rootUri: `file://${this.workspaceRoot}`,
      rootPath: this.workspaceRoot,
      workspaceFolders: [
        {
          uri: `file://${this.workspaceRoot}`,
          name: this.projectId,
        },
      ],
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: true,
            willSave: true,
            willSaveWaitUntil: true,
            didSave: true,
          },
          completion: {
            dynamicRegistration: true,
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              deprecatedSupport: true,
              preselectSupport: true,
              insertReplaceSupport: true,
              resolveSupport: {
                properties: ['documentation', 'detail', 'additionalTextEdits'],
              },
            },
            contextSupport: true,
          },
          hover: {
            dynamicRegistration: true,
            contentFormat: ['markdown', 'plaintext'],
          },
          signatureHelp: {
            dynamicRegistration: true,
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: {
                labelOffsetSupport: true,
              },
            },
            contextSupport: true,
          },
          definition: {
            dynamicRegistration: true,
            linkSupport: true,
          },
          references: {
            dynamicRegistration: true,
          },
          documentHighlight: {
            dynamicRegistration: true,
          },
          documentSymbol: {
            dynamicRegistration: true,
            symbolKind: {
              valueSet: Array.from({ length: 26 }, (_, i) => i + 1),
            },
            hierarchicalDocumentSymbolSupport: true,
          },
          codeAction: {
            dynamicRegistration: true,
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: [
                  'quickfix',
                  'refactor',
                  'refactor.extract',
                  'refactor.inline',
                  'refactor.rewrite',
                  'source',
                  'source.organizeImports',
                ],
              },
            },
            resolveSupport: {
              properties: ['edit'],
            },
          },
          formatting: {
            dynamicRegistration: true,
          },
          rangeFormatting: {
            dynamicRegistration: true,
          },
          rename: {
            dynamicRegistration: true,
            prepareSupport: true,
          },
          publishDiagnostics: {
            relatedInformation: true,
            tagSupport: {
              valueSet: [1, 2],
            },
            versionSupport: true,
            codeDescriptionSupport: true,
            dataSupport: true,
          },
        },
        workspace: {
          applyEdit: true,
          workspaceEdit: {
            documentChanges: true,
            resourceOperations: ['create', 'rename', 'delete'],
          },
          didChangeConfiguration: {
            dynamicRegistration: true,
          },
          didChangeWatchedFiles: {
            dynamicRegistration: true,
          },
          symbol: {
            dynamicRegistration: true,
          },
          executeCommand: {
            dynamicRegistration: true,
          },
          workspaceFolders: true,
          configuration: true,
        },
        window: {
          workDoneProgress: true,
          showMessage: {
            messageActionItem: {
              additionalPropertiesSupport: true,
            },
          },
          showDocument: {
            support: true,
          },
        },
        general: {
          staleRequestSupport: {
            cancel: true,
            retryOnContentModified: ['textDocument/semanticTokens/full'],
          },
        },
      },
      initializationOptions: this.config.initializationOptions || {},
    });

    this.serverCapabilities = (initResult as { capabilities: unknown }).capabilities;
    console.log(`[LSP ${this.config.languageId}] Server initialized for project ${this.projectId}`);

    // Send initialized notification
    this.sendNotification('initialized', {});
    this.initialized = true;
    this.emit('initialized');

    return this.serverCapabilities;
  }

  /**
   * Send a JSON-RPC request and wait for response
   */
  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to LSP server');
    }

    const id = this.requestId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, LSP_CLIENT_CONFIG.requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        method,
        timeoutHandle,
      });

      this.sendMessage(request);
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  sendNotification(method: string, params?: unknown): void {
    if (!this.connected || !this.socket) {
      console.warn(`[LSP ${this.config.languageId}] Cannot send notification, not connected`);
      return;
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.sendMessage(notification);
  }

  /**
   * Send a JSON-RPC response (for server requests)
   */
  sendResponse(id: number | string, result?: unknown, error?: JsonRpcError): void {
    if (!this.connected || !this.socket) {
      return;
    }

    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
    };

    if (error) {
      response.error = error;
    } else {
      response.result = result;
    }

    this.sendMessage(response);
  }

  /**
   * Disconnect from the LSP server gracefully
   */
  async disconnect(graceful: boolean = true): Promise<void> {
    // Disable auto-reconnect
    this.autoReconnect = false;

    // Cancel any pending reconnect
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (!this.connected && !this.socket) {
      return;
    }

    // Send shutdown request if graceful
    if (graceful && this.initialized) {
      try {
        const shutdownPromise = this.sendRequest('shutdown');
        // Add timeout to shutdown request
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Shutdown timeout')), 5000)
        );

        await Promise.race([shutdownPromise, timeoutPromise]);
        this.sendNotification('exit');

        // Wait a bit for exit to be processed
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        console.warn(`[LSP ${this.config.languageId}] Graceful shutdown failed:`, e instanceof Error ? e.message : 'unknown');
      }
    }

    this.cleanup();
    console.log(`[LSP ${this.config.languageId}] Disconnected from project ${this.projectId}`);
  }

  /**
   * Destroy the client permanently (no reconnection)
   */
  async destroy(): Promise<void> {
    this.destroyed = true;
    this.autoReconnect = false;
    await this.disconnect(false);
    this.removeAllListeners();
    console.log(`[LSP ${this.config.languageId}] Client destroyed for project ${this.projectId}`);
  }

  /**
   * Check if the client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Check if the client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get server capabilities
   */
  getServerCapabilities(): unknown {
    return this.serverCapabilities;
  }

  // ==================== Private Methods ====================

  private handleData(data: Buffer): void {
    const result = this.parser.parse(data);

    if (result.error) {
      console.error(`[LSP ${this.config.languageId}] Parse error:`, result.error.message);
      this.emit('error', result.error);

      // Critical parse errors should trigger reconnection
      if (result.error.message.includes('Too many parse errors')) {
        console.warn(`[LSP ${this.config.languageId}] Critical parse error, reconnecting...`);
        this.cleanup();
        this.scheduleReconnect();
        return;
      }
    }

    for (const message of result.messages) {
      this.handleMessage(message);
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    // Check if it's a response
    if ('id' in message && message.id !== null && !('method' in message)) {
      const response = message as JsonRpcResponse;
      const responseId = response.id as number | string; // Narrow type (we already checked it's not null above)
      const pending = this.pendingRequests.get(responseId);

      if (pending) {
        clearTimeout(pending.timeoutHandle);
        this.pendingRequests.delete(responseId);

        if (response.error) {
          pending.reject(new Error(`${response.error.message} (code: ${response.error.code})`));
        } else {
          pending.resolve(response.result);
        }
      }
      return;
    }

    // Check if it's a request from server
    if ('id' in message && 'method' in message) {
      const request = message as JsonRpcRequest;
      this.emit('request', request.id, request.method, request.params);
      return;
    }

    // It's a notification from server
    if ('method' in message) {
      const notification = message as JsonRpcNotification;
      this.emit('notification', notification.method, notification.params);
    }
  }

  private sendMessage(message: JsonRpcMessage): void {
    if (!this.socket || !this.connected) {
      return;
    }

    const content = JSON.stringify(message);
    const contentBuffer = Buffer.from(content, 'utf-8');
    const header = `Content-Length: ${contentBuffer.length}\r\n\r\n`;
    const headerBuffer = Buffer.from(header, 'utf-8');

    this.socket.write(Buffer.concat([headerBuffer, contentBuffer]));
  }

  private cleanup(): void {
    this.connected = false;
    this.initialized = false;

    // Stop keep-alive timer
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }

    // Reject all pending requests with proper error
    const error = new Error('Connection closed');
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(error);
    }
    this.pendingRequests.clear();

    // Reset parser state
    this.parser.reset();

    // Close socket safely
    if (this.socket) {
      try {
        // Remove all listeners to prevent memory leaks
        this.socket.removeAllListeners();

        // Destroy the socket if still connected
        if (!this.socket.destroyed) {
          this.socket.destroy();
        }
      } catch (e) {
        console.warn(`[LSP ${this.config.languageId}] Error during socket cleanup:`, e instanceof Error ? e.message : 'unknown');
      } finally {
        this.socket = null;
      }
    }
  }

  private scheduleReconnect(): void {
    // Don't reconnect if destroyed or disabled
    if (this.destroyed || !this.autoReconnect) {
      console.log(`[LSP ${this.config.languageId}] Reconnection disabled for project ${this.projectId}`);
      return;
    }

    // Cancel any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Check if we've exceeded max attempts
    if (this.reconnectAttempts >= LSP_CLIENT_CONFIG.maxReconnectAttempts) {
      console.error(`[LSP ${this.config.languageId}] Max reconnection attempts (${LSP_CLIENT_CONFIG.maxReconnectAttempts}) reached for project ${this.projectId}`);
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff with jitter to prevent thundering herd
    const baseDelay = LSP_CLIENT_CONFIG.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    const jitter = Math.random() * 1000; // Random jitter up to 1 second
    const delay = Math.min(baseDelay + jitter, 60000); // Cap at 60 seconds

    console.log(`[LSP ${this.config.languageId}] Scheduling reconnect in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${LSP_CLIENT_CONFIG.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      // Double-check we still want to reconnect
      if (this.destroyed || !this.autoReconnect) {
        return;
      }

      console.log(`[LSP ${this.config.languageId}] Attempting reconnection (${this.reconnectAttempts}/${LSP_CLIENT_CONFIG.maxReconnectAttempts})...`);

      try {
        await this.connect();
        console.log(`[LSP ${this.config.languageId}] Reconnected successfully`);

        // Re-initialize after reconnection
        try {
          await this.initialize();
          console.log(`[LSP ${this.config.languageId}] Re-initialized successfully`);
        } catch (initError) {
          console.error(`[LSP ${this.config.languageId}] Re-initialization failed:`, initError);
          // Cleanup and try again
          this.cleanup();
          this.scheduleReconnect();
        }
      } catch (connectError) {
        console.error(`[LSP ${this.config.languageId}] Reconnection failed:`, connectError instanceof Error ? connectError.message : 'unknown');
        // Schedule next attempt
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Enable or disable automatic reconnection
   */
  setAutoReconnect(enabled: boolean): void {
    this.autoReconnect = enabled;
    if (!enabled && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    connected: boolean;
    initialized: boolean;
    reconnectAttempts: number;
    connectionErrors: number;
    pendingRequests: number;
    lastActivity: number;
    parser: { bufferSize: number; parseErrorCount: number };
  } {
    return {
      connected: this.connected,
      initialized: this.initialized,
      reconnectAttempts: this.reconnectAttempts,
      connectionErrors: this.connectionErrorCount,
      pendingRequests: this.pendingRequests.size,
      lastActivity: this.lastActivityTime,
      parser: this.parser.getStats(),
    };
  }

  private startKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }

    this.keepAliveTimer = setInterval(() => {
      if (!this.connected || !this.initialized) {
        return;
      }

      const idleTime = Date.now() - this.lastActivityTime;

      // Only send keep-alive if we've been idle
      if (idleTime > LSP_CLIENT_CONFIG.keepAliveIntervalMs) {
        // Send a lightweight notification to keep connection alive
        // Using a custom notification that LSP servers should ignore
        try {
          this.sendNotification('$/keepAlive', { timestamp: Date.now() });
        } catch (e) {
          console.warn(`[LSP ${this.config.languageId}] Keep-alive failed:`, e instanceof Error ? e.message : 'unknown');
        }
      }
    }, LSP_CLIENT_CONFIG.keepAliveIntervalMs);
  }
}

// ==================== Connection Pool ====================

/**
 * Pool of LSP client connections
 * Manages multiple clients for different projects/languages
 */
export class LSPClientPool {
  private clients: Map<string, TCPLSPClient> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly CLEANUP_INTERVAL_MS = 60000; // 1 minute

  constructor() {
    // Start periodic cleanup of dead clients
    this.startCleanup();
  }

  /**
   * Get or create a client for a project/language combination
   */
  async getClient(
    projectId: string,
    config: LSPServerConfig,
    host: string,
    workspaceRoot: string,
    containerId?: string
  ): Promise<TCPLSPClient> {
    const key = `${projectId}:${config.languageId}`;
    let client = this.clients.get(key);

    // Return existing connected client
    if (client && client.isConnected()) {
      return client;
    }

    // Clean up old disconnected client
    if (client) {
      try {
        await client.destroy();
      } catch (e) {
        console.warn(`[LSP Pool] Error destroying old client:`, e);
      }
      this.clients.delete(key);
    }

    // Create new client
    client = new TCPLSPClient({
      host,
      port: config.port,
      config,
      workspaceRoot,
      projectId,
      containerId,
    });

    // Set up error handler to track client health
    client.on('error', (error: Error) => {
      console.error(`[LSP Pool] Client error for ${key}:`, error.message);
    });

    client.on('disconnected', (reason: string) => {
      console.log(`[LSP Pool] Client disconnected for ${key}: ${reason}`);
    });

    this.clients.set(key, client);

    try {
      await client.connect();
      await client.initialize();
      return client;
    } catch (error) {
      // Remove failed client from pool
      this.clients.delete(key);
      throw error;
    }
  }

  /**
   * Get existing client if connected
   */
  getExistingClient(projectId: string, languageId: string): TCPLSPClient | null {
    const key = `${projectId}:${languageId}`;
    const client = this.clients.get(key);

    if (client && client.isConnected()) {
      return client;
    }

    return null;
  }

  /**
   * Remove a specific client
   */
  async removeClient(projectId: string, languageId: string): Promise<void> {
    const key = `${projectId}:${languageId}`;
    const client = this.clients.get(key);

    if (client) {
      await client.destroy();
      this.clients.delete(key);
      console.log(`[LSP Pool] Removed client: ${key}`);
    }
  }

  /**
   * Remove all clients for a project
   */
  async removeProject(projectId: string): Promise<void> {
    const toRemove: Array<[string, TCPLSPClient]> = [];

    for (const [key, client] of this.clients) {
      if (key.startsWith(`${projectId}:`)) {
        toRemove.push([key, client]);
      }
    }

    console.log(`[LSP Pool] Removing ${toRemove.length} clients for project ${projectId}`);

    // Disconnect all clients in parallel
    await Promise.allSettled(
      toRemove.map(async ([key, client]) => {
        try {
          await client.destroy();
          this.clients.delete(key);
        } catch (e) {
          console.warn(`[LSP Pool] Error removing client ${key}:`, e);
        }
      })
    );
  }

  /**
   * Disconnect all clients
   */
  async disconnectAll(): Promise<void> {
    console.log(`[LSP Pool] Disconnecting all ${this.clients.size} clients`);

    const disconnectPromises = Array.from(this.clients.values()).map(client =>
      client.destroy().catch(e => {
        console.warn('[LSP Pool] Error during disconnect:', e);
      })
    );

    await Promise.allSettled(disconnectPromises);
    this.clients.clear();
  }

  /**
   * Cleanup disconnected clients periodically
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupDeadClients();
    }, this.CLEANUP_INTERVAL_MS);
  }

  private async cleanupDeadClients(): Promise<void> {
    const toRemove: string[] = [];

    for (const [key, client] of this.clients) {
      if (!client.isConnected()) {
        const stats = client.getStats();

        // Remove if not connected and not trying to reconnect
        if (stats.reconnectAttempts === 0 || stats.reconnectAttempts >= LSP_CLIENT_CONFIG.maxReconnectAttempts) {
          toRemove.push(key);
        }
      }
    }

    if (toRemove.length > 0) {
      console.log(`[LSP Pool] Cleaning up ${toRemove.length} dead clients`);

      for (const key of toRemove) {
        const client = this.clients.get(key);
        if (client) {
          try {
            await client.destroy();
          } catch (e) {
            console.warn(`[LSP Pool] Error destroying client ${key}:`, e);
          }
          this.clients.delete(key);
        }
      }
    }
  }

  /**
   * Stop the pool and cleanup
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    await this.disconnectAll();
  }

  /**
   * Get stats
   */
  getStats(): {
    total: number;
    connected: number;
    initialized: number;
    byProject: Record<string, number>;
  } {
    let connected = 0;
    let initialized = 0;
    const byProject: Record<string, number> = {};

    for (const [key, client] of this.clients) {
      if (client.isConnected()) connected++;
      if (client.isInitialized()) initialized++;

      const projectId = key.split(':')[0];
      byProject[projectId] = (byProject[projectId] || 0) + 1;
    }

    return {
      total: this.clients.size,
      connected,
      initialized,
      byProject,
    };
  }

  /**
   * Get detailed stats for a specific client
   */
  getClientStats(projectId: string, languageId: string): ReturnType<TCPLSPClient['getStats']> | null {
    const client = this.getExistingClient(projectId, languageId);
    return client ? client.getStats() : null;
  }
}

export const lspClientPool = new LSPClientPool();
export default TCPLSPClient;
