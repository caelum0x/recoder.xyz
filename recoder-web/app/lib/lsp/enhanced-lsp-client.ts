/**
 * Enhanced LSP Client Service
 * Production-quality LSP client with:
 * - Connection state management
 * - Automatic reconnection
 * - Request debouncing and cancellation
 * - Diagnostics support
 * - Comprehensive error handling
 */

// Browser-compatible EventEmitter implementation
class EventEmitter {
  private events: Map<string, Function[]> = new Map();

  on(event: string, listener: Function): this {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(listener);
    return this;
  }

  off(event: string, listener: Function): this {
    const listeners = this.events.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const listeners = this.events.get(event);
    if (listeners && listeners.length > 0) {
      listeners.forEach(listener => listener(...args));
      return true;
    }
    return false;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }
}
import { dockerPost, dockerGet } from '~/lib/services/docker-api';
import { workbenchStore } from '~/lib/stores/workbench';
import type {
  LSPPosition,
  LSPLocation,
  LSPDiagnostic,
  LSPCompletionItem,
  LSPHover,
  LSPSignatureHelp,
  LSPServerStatus,
  LSPConnectionState,
  LSPConnectionStatus,
  LSPDocumentSymbol,
  LSPCompletionContext,
} from './types';

import { CompletionTriggerKind } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('EnhancedLSP');

// Re-export types for convenience
export type {
  LSPPosition,
  LSPLocation,
  LSPDiagnostic,
  LSPCompletionItem,
  LSPHover,
  LSPSignatureHelp,
  LSPServerStatus,
  LSPConnectionState,
  LSPConnectionStatus,
  LSPDocumentSymbol,
};

export { DiagnosticSeverity, CompletionItemKind } from './types';

// ============================================
// Configuration
// ============================================

interface LSPClientConfig {
  /** Reconnection delay in ms */
  reconnectDelay: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts: number;
  /** Request timeout in ms */
  requestTimeout: number;
  /** Completion debounce time in ms */
  completionDebounce: number;
  /** Hover debounce time in ms */
  hoverDebounce: number;
  /** Document sync debounce time in ms */
  syncDebounce: number;
  /** Enable verbose logging */
  verbose: boolean;
}

const DEFAULT_CONFIG: LSPClientConfig = {
  reconnectDelay: 2000,
  maxReconnectAttempts: 5,
  requestTimeout: 60000,
  completionDebounce: 150,
  hoverDebounce: 300,
  syncDebounce: 500,
  verbose: false,
};

// ============================================
// Document Tracking
// ============================================

interface DocumentVersion {
  version: number;
  content: string;
  lastSync: number;
  languageId: string;
}

interface DiagnosticsState {
  diagnostics: Map<string, LSPDiagnostic[]>;
  listeners: Set<(uri: string, diagnostics: LSPDiagnostic[]) => void>;
}

// ============================================
// Debounced Request Manager
// ============================================

class DebouncedRequestManager {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private abortControllers = new Map<string, AbortController>();

  schedule<T>(
    key: string,
    fn: (signal: AbortSignal) => Promise<T>,
    debounceMs: number
  ): Promise<T> {
    // Cancel existing request
    this.cancel(key);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(async () => {
        this.timers.delete(key);

        const controller = new AbortController();
        this.abortControllers.set(key, controller);

        try {
          const result = await fn(controller.signal);
          this.abortControllers.delete(key);
          resolve(result);
        } catch (error) {
          this.abortControllers.delete(key);
          if ((error as Error).name !== 'AbortError') {
            reject(error);
          }
        }
      }, debounceMs);

      this.timers.set(key, timeout);
    });
  }

  cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }

    const controller = this.abortControllers.get(key);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(key);
    }
  }

  cancelAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
  }
}

// ============================================
// Enhanced LSP Client
// ============================================

export class EnhancedLSPClient extends EventEmitter {
  private projectId: string;
  private config: LSPClientConfig;

  // Connection state
  private connectionState: LSPConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastConnected: number | null = null;
  private lastError: string | null = null;

  // Document tracking
  private documentVersions = new Map<string, DocumentVersion>();
  private diagnosticsState: DiagnosticsState = {
    diagnostics: new Map(),
    listeners: new Set(),
  };

  // Server state
  private serverStatus = new Map<string, LSPServerStatus>();
  private initPromise: Promise<void> | null = null;
  private isStarted = false;

  // Request management
  private debouncedRequests = new DebouncedRequestManager();
  private activeRequests = new Map<string, AbortController>();

  constructor(projectId: string, config: Partial<LSPClientConfig> = {}) {
    super();
    this.projectId = projectId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================
  // Connection Management
  // ============================================

  async connect(): Promise<boolean> {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      return this.isStarted;
    }

    this.setConnectionState('connecting');
    return this.initialize();
  }

  async disconnect(): Promise<void> {
    this.cancelReconnect();
    this.debouncedRequests.cancelAll();

    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();

    if (this.isStarted) {
      await this.stop();
    }

    this.setConnectionState('disconnected');
  }

  async reconnect(): Promise<void> {
    this.log('Attempting reconnection...');
    this.setConnectionState('reconnecting');
    this.reconnectAttempts++;

    const success = await this.initialize();

    if (success) {
      this.reconnectAttempts = 0;
      this.emit('reconnected');
    } else {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log('Max reconnection attempts reached');
      this.setConnectionState('failed');
      this.emit('reconnect-failed');
      return;
    }

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    this.log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setConnectionState(state: LSPConnectionState): void {
    const prevState = this.connectionState;
    this.connectionState = state;

    if (prevState !== state) {
      this.emit('connection-state-changed', state);
    }
  }

  getConnectionStatus(): LSPConnectionStatus {
    return {
      state: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      lastConnected: this.lastConnected ?? undefined,
      lastError: this.lastError ?? undefined,
    };
  }

  // ============================================
  // Initialization
  // ============================================

  async initialize(): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise;
      return this.isStarted;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
    return this.isStarted;
  }

  private async doInitialize(): Promise<void> {
    // Guard: don't start LSP until container is ready
    if (!workbenchStore.containerReady.get()) {
      this.log('Skipping LSP start - container not ready');
      this.isStarted = false;
      this.initPromise = null;
      return;
    }

    try {
      const response = await this.makeRequest<{
        success: boolean;
        servers: LSPServerStatus[];
        message: string;
      }>('POST', `/api/lsp/${this.projectId}/start`, {});

      if (response.success && response.servers) {
        for (const server of response.servers) {
          this.serverStatus.set(server.languageId, server);
        }
        this.isStarted = true;
        this.lastConnected = Date.now();
        this.setConnectionState('connected');
        this.emit('connected');
        this.log('LSP servers started:', response.message);
      } else {
        throw new Error('Failed to start LSP servers');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      this.lastError = error.message;
      this.isStarted = false;
      this.emit('error', error);

      // Schedule reconnection
      if (this.connectionState !== 'failed') {
        this.scheduleReconnect();
      }
    } finally {
      this.initPromise = null;
    }
  }

  // ============================================
  // Document Synchronization
  // ============================================

  async syncDocument(filePath: string, content: string, languageId?: string): Promise<boolean> {
    if (!this.isStarted) {
      await this.initialize();
    }

    const existing = this.documentVersions.get(filePath);
    const version = existing ? existing.version + 1 : 1;

    // Skip sync if content hasn't changed
    if (existing && existing.content === content) {
      return true;
    }

    const detectedLanguageId = languageId || this.detectLanguageId(filePath);
    if (!detectedLanguageId) {
      return false;
    }

    try {
      const response = await this.makeRequest<{ success: boolean; synced: boolean; reason?: string }>(
        'POST',
        `/api/lsp/${this.projectId}/sync`,
        {
          filePath: this.normalizeFilePath(filePath),
          content,
          version,
        }
      );

      if (response.synced) {
        this.documentVersions.set(filePath, {
          version,
          content,
          lastSync: Date.now(),
          languageId: detectedLanguageId,
        });
        return true;
      }

      return false;
    } catch (err) {
      this.handleError('syncDocument', err);
      return false;
    }
  }

  async closeDocument(filePath: string): Promise<void> {
    this.documentVersions.delete(filePath);
    this.diagnosticsState.diagnostics.delete(filePath);
  }

  // ============================================
  // LSP Operations with Debouncing
  // ============================================

  async getCompletions(
    filePath: string,
    position: LSPPosition,
    content: string,
    triggerCharacter?: string
  ): Promise<LSPCompletionItem[]> {
    await this.ensureSynced(filePath, content);

    const key = `completion:${filePath}:${position.line}:${position.character}`;

    return this.debouncedRequests.schedule(
      key,
      async (signal) => {
        try {
          const context: LSPCompletionContext = triggerCharacter
            ? {
                triggerKind: CompletionTriggerKind.TriggerCharacter,
                triggerCharacter,
              }
            : {
                triggerKind: CompletionTriggerKind.Invoked,
              };

          const response = await this.makeRequest<{
            success: boolean;
            result: { items: LSPCompletionItem[] } | LSPCompletionItem[] | null;
          }>(
            'POST',
            `/api/lsp/${this.projectId}/request`,
            {
              filePath: this.normalizeFilePath(filePath),
              method: 'textDocument/completion',
              params: { position, context },
            },
            signal
          );

          if (!response.success || !response.result) {
            return [];
          }

          const items = Array.isArray(response.result) ? response.result : response.result.items;
          return items || [];
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            this.handleError('getCompletions', err);
          }
          return [];
        }
      },
      this.config.completionDebounce
    );
  }

  async getHover(
    filePath: string,
    position: LSPPosition,
    content: string
  ): Promise<LSPHover | null> {
    await this.ensureSynced(filePath, content);

    const key = `hover:${filePath}:${position.line}:${position.character}`;

    return this.debouncedRequests.schedule(
      key,
      async (signal) => {
        try {
          const response = await this.makeRequest<{
            success: boolean;
            result: LSPHover | null;
          }>(
            'POST',
            `/api/lsp/${this.projectId}/request`,
            {
              filePath: this.normalizeFilePath(filePath),
              method: 'textDocument/hover',
              params: { position },
            },
            signal
          );

          return response.success ? response.result : null;
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            this.handleError('getHover', err);
          }
          return null;
        }
      },
      this.config.hoverDebounce
    );
  }

  async getDefinition(
    filePath: string,
    position: LSPPosition,
    content: string
  ): Promise<LSPLocation[]> {
    await this.ensureSynced(filePath, content);

    try {
      const response = await this.makeRequest<{
        success: boolean;
        result: LSPLocation | LSPLocation[] | null;
      }>('POST', `/api/lsp/${this.projectId}/request`, {
        filePath: this.normalizeFilePath(filePath),
        method: 'textDocument/definition',
        params: { position },
      });

      if (!response.success || !response.result) {
        return [];
      }

      return Array.isArray(response.result) ? response.result : [response.result];
    } catch (err) {
      this.handleError('getDefinition', err);
      return [];
    }
  }

  async getReferences(
    filePath: string,
    position: LSPPosition,
    content: string,
    includeDeclaration = true
  ): Promise<LSPLocation[]> {
    await this.ensureSynced(filePath, content);

    try {
      const response = await this.makeRequest<{
        success: boolean;
        result: LSPLocation[] | null;
      }>('POST', `/api/lsp/${this.projectId}/request`, {
        filePath: this.normalizeFilePath(filePath),
        method: 'textDocument/references',
        params: {
          position,
          context: { includeDeclaration },
        },
      });

      return response.success && response.result ? response.result : [];
    } catch (err) {
      this.handleError('getReferences', err);
      return [];
    }
  }

  async getSignatureHelp(
    filePath: string,
    position: LSPPosition,
    content: string
  ): Promise<LSPSignatureHelp | null> {
    await this.ensureSynced(filePath, content);

    try {
      const response = await this.makeRequest<{
        success: boolean;
        result: LSPSignatureHelp | null;
      }>('POST', `/api/lsp/${this.projectId}/request`, {
        filePath: this.normalizeFilePath(filePath),
        method: 'textDocument/signatureHelp',
        params: { position },
      });

      return response.success ? response.result : null;
    } catch (err) {
      this.handleError('getSignatureHelp', err);
      return null;
    }
  }

  async getDocumentSymbols(
    filePath: string,
    content: string
  ): Promise<LSPDocumentSymbol[]> {
    await this.ensureSynced(filePath, content);

    try {
      const response = await this.makeRequest<{
        success: boolean;
        result: LSPDocumentSymbol[] | null;
      }>('POST', `/api/lsp/${this.projectId}/request`, {
        filePath: this.normalizeFilePath(filePath),
        method: 'textDocument/documentSymbol',
        params: {},
      });

      return response.success && response.result ? response.result : [];
    } catch (err) {
      this.handleError('getDocumentSymbols', err);
      return [];
    }
  }

  // ============================================
  // Diagnostics Management
  // ============================================

  getDiagnostics(filePath: string): LSPDiagnostic[] {
    return this.diagnosticsState.diagnostics.get(filePath) || [];
  }

  getAllDiagnostics(): Map<string, LSPDiagnostic[]> {
    return new Map(this.diagnosticsState.diagnostics);
  }

  onDiagnostics(listener: (uri: string, diagnostics: LSPDiagnostic[]) => void): () => void {
    this.diagnosticsState.listeners.add(listener);
    return () => this.diagnosticsState.listeners.delete(listener);
  }

  private updateDiagnostics(uri: string, diagnostics: LSPDiagnostic[]): void {
    this.diagnosticsState.diagnostics.set(uri, diagnostics);

    for (const listener of this.diagnosticsState.listeners) {
      try {
        listener(uri, diagnostics);
      } catch (err) {
        logger.error('[LSP] Diagnostics listener error:', err);
      }
    }

    this.emit('diagnostics', uri, diagnostics);
  }

  // ============================================
  // Server Status
  // ============================================

  async getStatus(): Promise<LSPServerStatus[]> {
    try {
      const response = await this.makeRequest<{
        success: boolean;
        servers: LSPServerStatus[];
      }>('GET', `/api/lsp/${this.projectId}/status`, undefined);

      if (response.success && response.servers) {
        for (const server of response.servers) {
          this.serverStatus.set(server.languageId, server);
        }
        return response.servers;
      }

      return Array.from(this.serverStatus.values());
    } catch (err) {
      this.handleError('getStatus', err);
      return Array.from(this.serverStatus.values());
    }
  }

  async stop(): Promise<void> {
    try {
      await this.makeRequest('POST', `/api/lsp/${this.projectId}/stop`, {});
    } catch (err) {
      this.handleError('stop', err);
    } finally {
      this.isStarted = false;
      this.serverStatus.clear();
      this.documentVersions.clear();
      this.diagnosticsState.diagnostics.clear();
      this.initPromise = null;
      this.debouncedRequests.cancelAll();

      for (const controller of this.activeRequests.values()) {
        controller.abort();
      }
      this.activeRequests.clear();
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  isReady(): boolean {
    return this.isStarted && this.connectionState === 'connected';
  }

  isAvailableForFile(filePath: string): boolean {
    if (!this.isStarted) return false;
    const ext = this.getExtension(filePath);
    return this.detectLanguageId(filePath) !== null;
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private async ensureSynced(filePath: string, content: string): Promise<void> {
    const existing = this.documentVersions.get(filePath);

    if (!existing || existing.content !== content || Date.now() - existing.lastSync > 5000) {
      await this.syncDocument(filePath, content);
    }
  }

  private async makeRequest<T = any>(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    if (method === 'GET') {
      return await dockerGet<T>(url, signal ? { signal } : undefined);
    } else {
      return await dockerPost<T>(url, body, signal ? { signal } : undefined);
    }
  }

  private normalizeFilePath(filePath: string): string {
    return filePath.replace(/^\/+/, '').replace(/^workspace\//, '');
  }

  private getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot >= 0 ? filePath.substring(lastDot).toLowerCase() : '';
  }

  private detectLanguageId(filePath: string): string | null {
    const ext = this.getExtension(filePath);
    const extensionMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.py': 'python',
      '.pyi': 'python',
      '.go': 'go',
      '.mod': 'go',
      '.sum': 'go',
      '.rs': 'rust',
    };

    return extensionMap[ext] || null;
  }

  private handleError(operation: string, error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.log(`Error in ${operation}:`, err.message);
    this.emit('error', err);

    // Check if we should reconnect
    if (this.shouldReconnect(err)) {
      this.reconnect();
    }
  }

  private shouldReconnect(error: Error): boolean {
    // Reconnect on network errors or connection failures
    return (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('connection')
    );
  }

  private log(...args: any[]): void {
    if (this.config.verbose) {
      logger.info('[EnhancedLSPClient]', ...args);
    }
  }
}

// ============================================
// Singleton Instance Manager
// ============================================

const clientInstances = new Map<string, EnhancedLSPClient>();

export function getEnhancedLSPClient(
  projectId: string,
  config?: Partial<LSPClientConfig>
): EnhancedLSPClient {
  let client = clientInstances.get(projectId);

  if (!client) {
    client = new EnhancedLSPClient(projectId, config);
    clientInstances.set(projectId, client);
  }

  return client;
}

export async function disposeEnhancedLSPClient(projectId: string): Promise<void> {
  const client = clientInstances.get(projectId);

  if (client) {
    await client.disconnect();
    client.removeAllListeners();
    clientInstances.delete(projectId);
  }
}

export async function disposeAllEnhancedLSPClients(): Promise<void> {
  for (const client of clientInstances.values()) {
    await client.disconnect();
    client.removeAllListeners();
  }
  clientInstances.clear();
}

export default EnhancedLSPClient;
