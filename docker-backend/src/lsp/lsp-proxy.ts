/**
 * LSP WebSocket-to-TCP Proxy
 * Bridges WebSocket connections from the browser to TCP-based LSP servers in containers
 * Implements JSON-RPC 2.0 message validation and security checks
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  LSP_SERVER_CONFIGS,
  LSPServerConfig,
  getConfigForLanguageId,
  isValidJsonRpcMessage,
  JSON_RPC_ERRORS,
} from './config.js';
import { lspServerManager } from './lsp-server-manager.js';
import { TCPLSPClient, JsonRpcMessage, JsonRpcRequest, JsonRpcNotification, JsonRpcResponse } from './tcp-lsp-client.js';

// ==================== Types ====================

export interface LSPProxySession {
  id: string;
  projectId: string;
  userId: string;
  languageId: string;
  ws: WebSocket;
  client: TCPLSPClient | null;
  createdAt: number;
  lastActivity: number;
  messageCount: number;
  errorCount: number;
}

export interface LSPProxyConfig {
  /** Max sessions per user */
  maxSessionsPerUser: number;
  /** Session timeout in ms */
  sessionTimeoutMs: number;
  /** Max messages per minute per session */
  maxMessagesPerMinute: number;
  /** Max message size in bytes */
  maxMessageSizeBytes: number;
  /** Allowed LSP methods (empty = allow all) */
  allowedMethods: string[];
  /** Blocked LSP methods */
  blockedMethods: string[];
}

const DEFAULT_PROXY_CONFIG: LSPProxyConfig = {
  maxSessionsPerUser: 10,
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  maxMessagesPerMinute: 1000,
  maxMessageSizeBytes: 5 * 1024 * 1024, // 5MB
  allowedMethods: [], // Empty = allow all
  blockedMethods: [
    // Block potentially dangerous methods
    'workspace/executeCommand',
    'workspace/applyEdit', // We handle this separately with proper validation
  ],
};

// ==================== Rate Limiter ====================

class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 1000) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    let timestamps = this.requests.get(key) || [];

    // Remove old timestamps
    timestamps = timestamps.filter(t => now - t < this.windowMs);

    if (timestamps.length >= this.maxRequests) {
      return false;
    }

    timestamps.push(now);
    this.requests.set(key, timestamps);
    return true;
  }

  reset(key: string): void {
    this.requests.delete(key);
  }
}

// ==================== LSP Proxy ====================

export class LSPProxy extends EventEmitter {
  private sessions: Map<string, LSPProxySession> = new Map();
  private userSessions: Map<string, Set<string>> = new Map(); // userId -> sessionIds
  private rateLimiter: RateLimiter;
  private config: LSPProxyConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<LSPProxyConfig> = {}) {
    super();
    this.config = { ...DEFAULT_PROXY_CONFIG, ...config };
    this.rateLimiter = new RateLimiter(60000, this.config.maxMessagesPerMinute);

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), 60000);
  }

  /**
   * Handle a new WebSocket connection for LSP
   */
  async handleConnection(
    ws: WebSocket,
    projectId: string,
    userId: string,
    languageId: string
  ): Promise<LSPProxySession | null> {
    // Validate language
    const config = getConfigForLanguageId(languageId);
    if (!config) {
      this.sendError(ws, null, JSON_RPC_ERRORS.INVALID_PARAMS, `Unsupported language: ${languageId}`);
      ws.close(4000, `Unsupported language: ${languageId}`);
      return null;
    }

    // Check user session limit
    const userSessionCount = this.userSessions.get(userId)?.size || 0;
    if (userSessionCount >= this.config.maxSessionsPerUser) {
      this.sendError(ws, null, JSON_RPC_ERRORS.INTERNAL_ERROR, 'Session limit reached');
      ws.close(4001, 'Session limit reached');
      return null;
    }

    // Generate session ID
    const sessionId = `${projectId}-${languageId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    // Create session
    const session: LSPProxySession = {
      id: sessionId,
      projectId,
      userId,
      languageId,
      ws,
      client: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
      errorCount: 0,
    };

    this.sessions.set(sessionId, session);

    // Track user sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);

    // Set up WebSocket handlers
    ws.on('message', (data: WebSocket.Data) => this.handleMessage(session, data));
    ws.on('close', () => this.handleClose(session));
    ws.on('error', (error) => this.handleError(session, error));

    // Try to connect to LSP server
    try {
      const client = await lspServerManager.getClient(projectId, languageId);

      if (!client) {
        // LSP server not running, try to start it
        console.log(`[LSP Proxy] LSP server not running, attempting to start ${languageId} for ${projectId}`);
        // The server manager will handle this - client will be null for now
      } else {
        session.client = client;

        // Forward notifications from LSP server to client
        client.on('notification', (method, params) => {
          this.sendNotification(ws, method, params);
        });

        // Handle server requests (e.g., workspace/configuration)
        client.on('request', (id, method, params) => {
          // Forward to client
          this.sendRequest(ws, id, method, params);
        });

        client.on('disconnected', () => {
          console.log(`[LSP Proxy] LSP client disconnected for session ${sessionId}`);
          session.client = null;
        });
      }
    } catch (error: any) {
      console.error(`[LSP Proxy] Failed to connect to LSP server:`, error.message);
      session.errorCount++;
    }

    console.log(`[LSP Proxy] Session created: ${sessionId} (${languageId} for ${projectId})`);

    // Send ready notification to client
    this.sendNotification(ws, '$/ready', {
      sessionId,
      languageId,
      connected: !!session.client,
    });

    return session;
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(session: LSPProxySession, data: WebSocket.Data): Promise<void> {
    session.lastActivity = Date.now();
    session.messageCount++;

    // Rate limiting
    if (!this.rateLimiter.isAllowed(session.id)) {
      this.sendError(session.ws, null, JSON_RPC_ERRORS.INTERNAL_ERROR, 'Rate limit exceeded');
      return;
    }

    // Parse message
    let message: JsonRpcMessage;
    try {
      const raw = data.toString();

      // Size check
      if (raw.length > this.config.maxMessageSizeBytes) {
        this.sendError(session.ws, null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Message too large');
        return;
      }

      message = JSON.parse(raw);
    } catch (e) {
      this.sendError(session.ws, null, JSON_RPC_ERRORS.PARSE_ERROR, 'Invalid JSON');
      return;
    }

    // Validate JSON-RPC structure
    if (!isValidJsonRpcMessage(message)) {
      this.sendError(session.ws, null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid JSON-RPC message');
      return;
    }

    // Check for method in requests/notifications
    if ('method' in message) {
      const method = message.method;

      // Block dangerous methods
      if (this.config.blockedMethods.includes(method)) {
        const id = 'id' in message ? message.id : null;
        this.sendError(session.ws, id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method not allowed: ${method}`);
        return;
      }

      // Check allowed methods if specified
      if (this.config.allowedMethods.length > 0 && !this.config.allowedMethods.includes(method)) {
        const id = 'id' in message ? message.id : null;
        this.sendError(session.ws, id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method not allowed: ${method}`);
        return;
      }
    }

    // Forward to LSP server
    if (!session.client) {
      // Try to get client again
      try {
        session.client = await lspServerManager.getClient(session.projectId, session.languageId);
      } catch (e) {
        // Ignore
      }

      if (!session.client) {
        const id = 'id' in message ? message.id : null;
        this.sendError(session.ws, id, JSON_RPC_ERRORS.SERVER_NOT_INITIALIZED, 'LSP server not connected');
        return;
      }

      // Set up event handlers for new client
      session.client.on('notification', (method, params) => {
        this.sendNotification(session.ws, method, params);
      });

      session.client.on('request', (id, method, params) => {
        this.sendRequest(session.ws, id, method, params);
      });
    }

    // Determine message type and forward
    try {
      if ('id' in message && 'method' in message) {
        // It's a request
        const request = message as JsonRpcRequest;
        const result = await session.client.sendRequest(request.method, request.params);
        this.sendResponse(session.ws, request.id, result);
      } else if ('method' in message) {
        // It's a notification
        const notification = message as JsonRpcNotification;
        session.client.sendNotification(notification.method, notification.params);
      } else if ('id' in message) {
        // It's a response to a server request
        const response = message as JsonRpcResponse;
        if (response.error) {
          session.client.sendResponse(response.id as number, undefined, response.error);
        } else {
          session.client.sendResponse(response.id as number, response.result);
        }
      }
    } catch (error: any) {
      session.errorCount++;
      console.error(`[LSP Proxy] Error forwarding message:`, error.message);
      const id = 'id' in message ? (message as JsonRpcRequest).id : null;
      this.sendError(session.ws, id, JSON_RPC_ERRORS.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(session: LSPProxySession): void {
    console.log(`[LSP Proxy] Session closed: ${session.id}`);

    // Clean up
    this.sessions.delete(session.id);

    const userSessions = this.userSessions.get(session.userId);
    if (userSessions) {
      userSessions.delete(session.id);
      if (userSessions.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }

    this.rateLimiter.reset(session.id);
  }

  /**
   * Handle WebSocket error
   */
  private handleError(session: LSPProxySession, error: Error): void {
    console.error(`[LSP Proxy] WebSocket error for session ${session.id}:`, error.message);
    session.errorCount++;
  }

  /**
   * Send JSON-RPC error response
   */
  private sendError(ws: WebSocket, id: number | string | null, code: number, message: string): void {
    if (ws.readyState !== WebSocket.OPEN) return;

    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };

    ws.send(JSON.stringify(response));
  }

  /**
   * Send JSON-RPC response
   */
  private sendResponse(ws: WebSocket, id: number | string, result: unknown): void {
    if (ws.readyState !== WebSocket.OPEN) return;

    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };

    ws.send(JSON.stringify(response));
  }

  /**
   * Send JSON-RPC notification
   */
  private sendNotification(ws: WebSocket, method: string, params?: unknown): void {
    if (ws.readyState !== WebSocket.OPEN) return;

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    ws.send(JSON.stringify(notification));
  }

  /**
   * Send JSON-RPC request
   */
  private sendRequest(ws: WebSocket, id: number | string, method: string, params?: unknown): void {
    if (ws.readyState !== WebSocket.OPEN) return;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    ws.send(JSON.stringify(request));
  }

  /**
   * Clean up stale sessions
   */
  private cleanupStaleSessions(): void {
    const now = Date.now();
    const stale: string[] = [];

    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > this.config.sessionTimeoutMs) {
        stale.push(id);
      }
    }

    for (const id of stale) {
      const session = this.sessions.get(id);
      if (session) {
        console.log(`[LSP Proxy] Closing stale session: ${id}`);
        session.ws.close(4002, 'Session timeout');
        this.handleClose(session);
      }
    }

    if (stale.length > 0) {
      console.log(`[LSP Proxy] Cleaned up ${stale.length} stale sessions`);
    }
  }

  /**
   * Close all sessions for a project
   */
  closeProjectSessions(projectId: string): void {
    for (const [id, session] of this.sessions) {
      if (session.projectId === projectId) {
        console.log(`[LSP Proxy] Closing session for project ${projectId}: ${id}`);
        session.ws.close(4003, 'Project closed');
        this.handleClose(session);
      }
    }
  }

  /**
   * Close all sessions for a user
   */
  closeUserSessions(userId: string): void {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return;

    for (const id of sessionIds) {
      const session = this.sessions.get(id);
      if (session) {
        console.log(`[LSP Proxy] Closing session for user ${userId}: ${id}`);
        session.ws.close(4004, 'User sessions closed');
        this.handleClose(session);
      }
    }
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    sessionsByLanguage: Record<string, number>;
    sessionsByUser: Record<string, number>;
    avgMessageCount: number;
  } {
    const byLanguage: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    let totalMessages = 0;

    for (const session of this.sessions.values()) {
      byLanguage[session.languageId] = (byLanguage[session.languageId] || 0) + 1;
      byUser[session.userId] = (byUser[session.userId] || 0) + 1;
      totalMessages += session.messageCount;
    }

    return {
      totalSessions: this.sessions.size,
      sessionsByLanguage: byLanguage,
      sessionsByUser: byUser,
      avgMessageCount: this.sessions.size > 0 ? totalMessages / this.sessions.size : 0,
    };
  }

  /**
   * Shutdown the proxy
   */
  shutdown(): void {
    console.log('[LSP Proxy] Shutting down...');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all sessions
    for (const session of this.sessions.values()) {
      session.ws.close(4005, 'Server shutdown');
    }

    this.sessions.clear();
    this.userSessions.clear();

    console.log('[LSP Proxy] Shutdown complete');
  }
}

// ==================== Express/WebSocket Integration ====================

import type { Application } from 'express';
import type { Server } from 'http';

/**
 * Register LSP WebSocket endpoint with Express app
 */
export function registerLSPWebSocket(
  wss: WebSocket.Server,
  proxy: LSPProxy,
  authenticateConnection: (req: any) => Promise<{ userId: string; projectId: string } | null>
): void {
  // We'll handle upgrade in server.ts, this is just a helper for message routing
  console.log('[LSP Proxy] WebSocket handler registered');
}

/**
 * Handle WebSocket upgrade for LSP connections
 * Called from server.ts when a WebSocket connection comes in on /ws/lsp/:projectId/:languageId
 */
export async function handleLSPUpgrade(
  ws: WebSocket,
  projectId: string,
  languageId: string,
  userId: string,
  proxy: LSPProxy
): Promise<void> {
  await proxy.handleConnection(ws, projectId, userId, languageId);
}

// Singleton instance
export const lspProxy = new LSPProxy();
export default LSPProxy;
