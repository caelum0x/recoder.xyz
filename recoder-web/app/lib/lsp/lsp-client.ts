/**
 * LSP Client Service
 * Handles communication with the TCP-based LSP backend
 * Provides a unified interface for LSP operations
 */

import { dockerPost, dockerGet } from '~/lib/services/docker-api';
import type {
  LSPPosition,
  LSPRange,
  LSPLocation,
  LSPDiagnostic,
  LSPCompletionItem,
  LSPCompletionList,
  LSPHover,
  LSPSignatureHelp,
  LSPServerStatus,
} from './types';

import { CompletionTriggerKind } from './types';

// Re-export types for backward compatibility
export type {
  LSPPosition,
  LSPRange,
  LSPLocation,
  LSPDiagnostic,
  LSPCompletionItem,
  LSPCompletionList,
  LSPHover,
  LSPSignatureHelp,
  LSPServerStatus,
};

export { DiagnosticSeverity, CompletionItemKind } from './types';

/** Document version tracking */
interface DocumentVersion {
  version: number;
  content: string;
  lastSync: number;
}

// ============================================
// LSP Client Class
// ============================================

export class LSPClient {
  private projectId: string;
  private documentVersions: Map<string, DocumentVersion> = new Map();
  private serverStatus: Map<string, LSPServerStatus> = new Map();
  private initPromise: Promise<void> | null = null;
  private isStarted = false;
  private pendingRequests: Map<string, AbortController> = new Map();

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * Initialize the LSP client by starting the backend LSP servers
   */
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
    try {
      const data = await dockerPost<{
        success: boolean;
        servers: LSPServerStatus[];
        message: string;
      }>(`/api/lsp/${this.projectId}/start`, {});

      if (data && data.success && data.servers) {
        for (const server of data.servers) {
          this.serverStatus.set(server.languageId, server);
        }
        this.isStarted = true;
        console.log('[LSPClient] LSP servers started:', data.message);
      } else {
        console.error('[LSPClient] Failed to start LSP servers');
        this.isStarted = false;
      }
    } catch (err) {
      console.error('[LSPClient] Error initializing LSP:', err);
      this.isStarted = false;
    }
  }

  /**
   * Check if LSP is available for a given file
   */
  isAvailableForFile(filePath: string): boolean {
    if (!this.isStarted) return false;

    const ext = this.getExtension(filePath);
    return this.getLanguageIdForExtension(ext) !== null;
  }

  /**
   * Sync a document with the LSP server
   * Call this when a file is opened or its content changes
   */
  async syncDocument(filePath: string, content: string): Promise<boolean> {
    if (!this.isStarted) {
      await this.initialize();
    }

    const existing = this.documentVersions.get(filePath);
    const version = existing ? existing.version + 1 : 1;

    // Skip sync if content hasn't changed
    if (existing && existing.content === content) {
      return true;
    }

    try {
      const data = await dockerPost<{ success: boolean; synced: boolean; reason?: string }>(
        `/api/lsp/${this.projectId}/sync`,
        {
          filePath: this.normalizeFilePath(filePath),
          content,
          version,
        }
      );

      if (data && data.synced) {
        this.documentVersions.set(filePath, {
          version,
          content,
          lastSync: Date.now(),
        });
        return true;
      }

      return false;
    } catch (err) {
      console.error('[LSPClient] Error syncing document:', err);
      return false;
    }
  }

  /**
   * Get completions at a position
   */
  async getCompletions(
    filePath: string,
    position: LSPPosition,
    content: string,
    triggerCharacter?: string
  ): Promise<LSPCompletionItem[]> {
    await this.ensureSynced(filePath, content);

    const requestId = `completion:${filePath}:${position.line}:${position.character}`;
    this.cancelPendingRequest(requestId);

    const controller = new AbortController();
    this.pendingRequests.set(requestId, controller);

    try {
      const data = await dockerPost<{
        success: boolean;
        result: LSPCompletionList | LSPCompletionItem[] | null;
      }>(`/api/lsp/${this.projectId}/request`, {
        filePath: this.normalizeFilePath(filePath),
        method: 'textDocument/completion',
        params: {
          position,
          context: triggerCharacter ? {
            triggerKind: CompletionTriggerKind.TriggerCharacter,
            triggerCharacter,
          } : {
            triggerKind: CompletionTriggerKind.Invoked,
          },
        },
      });

      if (!data || !data.success || !data.result) {
        return [];
      }

      // Handle both array and CompletionList responses
      const items = Array.isArray(data.result) ? data.result : data.result.items;
      return items || [];
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return [];
      }
      console.error('[LSPClient] Completion error:', err);
      return [];
    } finally {
      this.pendingRequests.delete(requestId);
    }
  }

  /**
   * Get hover information at a position
   */
  async getHover(
    filePath: string,
    position: LSPPosition,
    content: string
  ): Promise<LSPHover | null> {
    await this.ensureSynced(filePath, content);

    try {
      const data = await dockerPost<{
        success: boolean;
        result: LSPHover | null;
      }>(`/api/lsp/${this.projectId}/request`, {
        filePath: this.normalizeFilePath(filePath),
        method: 'textDocument/hover',
        params: {
          position,
        },
      });

      return data && data.success ? data.result : null;
    } catch (err) {
      console.error('[LSPClient] Hover error:', err);
      return null;
    }
  }

  /**
   * Go to definition
   */
  async getDefinition(
    filePath: string,
    position: LSPPosition,
    content: string
  ): Promise<LSPLocation[]> {
    await this.ensureSynced(filePath, content);

    try {
      const data = await dockerPost<{
        success: boolean;
        result: LSPLocation | LSPLocation[] | null;
      }>(`/api/lsp/${this.projectId}/request`, {
        filePath: this.normalizeFilePath(filePath),
        method: 'textDocument/definition',
        params: {
          position,
        },
      });

      if (!data || !data.success || !data.result) {
        return [];
      }

      // Normalize to array
      return Array.isArray(data.result) ? data.result : [data.result];
    } catch (err) {
      console.error('[LSPClient] Definition error:', err);
      return [];
    }
  }

  /**
   * Find references
   */
  async getReferences(
    filePath: string,
    position: LSPPosition,
    content: string,
    includeDeclaration = true
  ): Promise<LSPLocation[]> {
    await this.ensureSynced(filePath, content);

    try {
      const data = await dockerPost<{
        success: boolean;
        result: LSPLocation[] | null;
      }>(`/api/lsp/${this.projectId}/request`, {
        filePath: this.normalizeFilePath(filePath),
        method: 'textDocument/references',
        params: {
          position,
          context: {
            includeDeclaration,
          },
        },
      });

      return data && data.success && data.result ? data.result : [];
    } catch (err) {
      console.error('[LSPClient] References error:', err);
      return [];
    }
  }

  /**
   * Get signature help
   */
  async getSignatureHelp(
    filePath: string,
    position: LSPPosition,
    content: string
  ): Promise<LSPSignatureHelp | null> {
    await this.ensureSynced(filePath, content);

    try {
      const data = await dockerPost<{
        success: boolean;
        result: LSPSignatureHelp | null;
      }>(`/api/lsp/${this.projectId}/request`, {
        filePath: this.normalizeFilePath(filePath),
        method: 'textDocument/signatureHelp',
        params: {
          position,
        },
      });

      return data && data.success ? data.result : null;
    } catch (err) {
      console.error('[LSPClient] SignatureHelp error:', err);
      return null;
    }
  }

  /**
   * Get document symbols
   */
  async getDocumentSymbols(
    filePath: string,
    content: string
  ): Promise<Array<{
    name: string;
    kind: number;
    range: LSPRange;
    selectionRange: LSPRange;
    children?: Array<unknown>;
  }>> {
    await this.ensureSynced(filePath, content);

    try {
      const data = await dockerPost<{
        success: boolean;
        result: Array<unknown> | null;
      }>(`/api/lsp/${this.projectId}/request`, {
        filePath: this.normalizeFilePath(filePath),
        method: 'textDocument/documentSymbol',
        params: {},
      });

      return (data && data.success && data.result ? data.result : []) as Array<{
        name: string;
        kind: number;
        range: LSPRange;
        selectionRange: LSPRange;
        children?: Array<unknown>;
      }>;
    } catch (err) {
      console.error('[LSPClient] DocumentSymbol error:', err);
      return [];
    }
  }

  /**
   * Get current server status
   */
  async getStatus(): Promise<LSPServerStatus[]> {
    try {
      const data = await dockerGet<{
        success: boolean;
        servers: LSPServerStatus[];
      }>(`/api/lsp/${this.projectId}/status`);

      if (data && data.success && data.servers) {
        for (const server of data.servers) {
          this.serverStatus.set(server.languageId, server);
        }
        return data.servers;
      }

      return Array.from(this.serverStatus.values());
    } catch (err) {
      console.error('[LSPClient] Status error:', err);
      return Array.from(this.serverStatus.values());
    }
  }

  /**
   * Stop LSP servers for this project
   */
  async stop(): Promise<void> {
    try {
      await dockerPost(`/api/lsp/${this.projectId}/stop`, {});
      this.isStarted = false;
      this.serverStatus.clear();
      this.documentVersions.clear();
      this.initPromise = null;

      // Cancel all pending requests
      for (const controller of this.pendingRequests.values()) {
        controller.abort();
      }
      this.pendingRequests.clear();
    } catch (err) {
      console.error('[LSPClient] Stop error:', err);
    }
  }

  /**
   * Check if client is initialized and ready
   */
  isReady(): boolean {
    return this.isStarted;
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async ensureSynced(filePath: string, content: string): Promise<void> {
    const existing = this.documentVersions.get(filePath);

    // Sync if content changed or not synced recently (>5s)
    if (!existing || existing.content !== content || Date.now() - existing.lastSync > 5000) {
      await this.syncDocument(filePath, content);
    }
  }

  private cancelPendingRequest(requestId: string): void {
    const existing = this.pendingRequests.get(requestId);
    if (existing) {
      existing.abort();
      this.pendingRequests.delete(requestId);
    }
  }

  private normalizeFilePath(filePath: string): string {
    // Remove leading slashes and /workspace prefix
    return filePath.replace(/^\/+/, '').replace(/^workspace\//, '');
  }

  private getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot >= 0 ? filePath.substring(lastDot) : '';
  }

  private getLanguageIdForExtension(ext: string): string | null {
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

    return extensionMap[ext.toLowerCase()] || null;
  }
}

// ============================================
// Singleton Instance Manager
// ============================================

const clientInstances = new Map<string, LSPClient>();

/**
 * Get or create an LSP client for a project
 */
export function getLSPClient(projectId: string): LSPClient {
  let client = clientInstances.get(projectId);

  if (!client) {
    client = new LSPClient(projectId);
    clientInstances.set(projectId, client);
  }

  return client;
}

/**
 * Dispose of an LSP client
 */
export async function disposeLSPClient(projectId: string): Promise<void> {
  const client = clientInstances.get(projectId);

  if (client) {
    await client.stop();
    clientInstances.delete(projectId);
  }
}

/**
 * Dispose of all LSP clients
 */
export async function disposeAllLSPClients(): Promise<void> {
  for (const client of clientInstances.values()) {
    await client.stop();
  }
  clientInstances.clear();
}

export default LSPClient;
