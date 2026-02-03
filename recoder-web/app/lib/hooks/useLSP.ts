/**
 * useLSP - React hook for managing LSP connection and operations
 * Auto-starts LSP when a file is opened and provides LSP functionality
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  LSPClient,
  getLSPClient,
  disposeLSPClient,
  type LSPPosition,
  type LSPLocation,
  type LSPCompletionItem,
  type LSPHover,
  type LSPSignatureHelp,
  type LSPServerStatus,
} from '~/lib/lsp/lsp-client';
import { workbenchStore } from '~/lib/stores/workbench';

// ============================================
// Types
// ============================================

export interface UseLSPOptions {
  /** Whether to auto-initialize when hook mounts */
  autoStart?: boolean;
  /** Callback when LSP is ready */
  onReady?: () => void;
  /** Callback when LSP fails */
  onError?: (error: Error) => void;
}

export interface UseLSPResult {
  /** Whether LSP is initialized and ready */
  isReady: boolean;
  /** Whether LSP is currently initializing */
  isInitializing: boolean;
  /** Current error if any */
  error: Error | null;
  /** LSP server statuses */
  serverStatus: LSPServerStatus[];
  /** Initialize LSP (called automatically if autoStart is true) */
  initialize: () => Promise<boolean>;
  /** Stop LSP servers */
  stop: () => Promise<void>;
  /** Sync a document with LSP */
  syncDocument: (filePath: string, content: string) => Promise<boolean>;
  /** Get completions at a position */
  getCompletions: (
    filePath: string,
    position: LSPPosition,
    content: string,
    triggerCharacter?: string
  ) => Promise<LSPCompletionItem[]>;
  /** Get hover information */
  getHover: (
    filePath: string,
    position: LSPPosition,
    content: string
  ) => Promise<LSPHover | null>;
  /** Go to definition */
  getDefinition: (
    filePath: string,
    position: LSPPosition,
    content: string
  ) => Promise<LSPLocation[]>;
  /** Find references */
  getReferences: (
    filePath: string,
    position: LSPPosition,
    content: string
  ) => Promise<LSPLocation[]>;
  /** Get signature help */
  getSignatureHelp: (
    filePath: string,
    position: LSPPosition,
    content: string
  ) => Promise<LSPSignatureHelp | null>;
  /** Check if LSP is available for a file */
  isAvailableForFile: (filePath: string) => boolean;
  /** Refresh server status */
  refreshStatus: () => Promise<void>;
}

// ============================================
// Hook Implementation
// ============================================

export function useLSP(
  projectId: string | null | undefined,
  options: UseLSPOptions = {}
): UseLSPResult {
  const { autoStart = true, onReady, onError } = options;
  const containerReady = useStore(workbenchStore.containerReady);

  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [serverStatus, setServerStatus] = useState<LSPServerStatus[]>([]);

  const clientRef = useRef<LSPClient | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  // Update refs on each render
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  });

  // Initialize LSP
  const initialize = useCallback(async (): Promise<boolean> => {
    if (!projectId) {
      return false;
    }

    if (clientRef.current?.isReady()) {
      return true;
    }

    setIsInitializing(true);
    setError(null);

    try {
      const client = getLSPClient(projectId);
      clientRef.current = client;

      const success = await client.initialize();

      if (success) {
        setIsReady(true);
        const status = await client.getStatus();
        setServerStatus(status);
        onReadyRef.current?.();
      } else {
        setError(new Error('LSP initialization failed'));
        onErrorRef.current?.(new Error('LSP initialization failed'));
      }

      return success;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown LSP error');
      setError(error);
      onErrorRef.current?.(error);
      return false;
    } finally {
      setIsInitializing(false);
    }
  }, [projectId]);

  // Stop LSP
  const stop = useCallback(async (): Promise<void> => {
    if (projectId) {
      await disposeLSPClient(projectId);
      clientRef.current = null;
      setIsReady(false);
      setServerStatus([]);
    }
  }, [projectId]);

  // Sync document
  const syncDocument = useCallback(
    async (filePath: string, content: string): Promise<boolean> => {
      const client = clientRef.current;
      if (!client) {
        await initialize();
        return clientRef.current?.syncDocument(filePath, content) ?? false;
      }
      return client.syncDocument(filePath, content);
    },
    [initialize]
  );

  // Get completions
  const getCompletions = useCallback(
    async (
      filePath: string,
      position: LSPPosition,
      content: string,
      triggerCharacter?: string
    ): Promise<LSPCompletionItem[]> => {
      const client = clientRef.current;
      if (!client?.isReady()) {
        return [];
      }
      return client.getCompletions(filePath, position, content, triggerCharacter);
    },
    []
  );

  // Get hover
  const getHover = useCallback(
    async (
      filePath: string,
      position: LSPPosition,
      content: string
    ): Promise<LSPHover | null> => {
      const client = clientRef.current;
      if (!client?.isReady()) {
        return null;
      }
      return client.getHover(filePath, position, content);
    },
    []
  );

  // Get definition
  const getDefinition = useCallback(
    async (
      filePath: string,
      position: LSPPosition,
      content: string
    ): Promise<LSPLocation[]> => {
      const client = clientRef.current;
      if (!client?.isReady()) {
        return [];
      }
      return client.getDefinition(filePath, position, content);
    },
    []
  );

  // Get references
  const getReferences = useCallback(
    async (
      filePath: string,
      position: LSPPosition,
      content: string
    ): Promise<LSPLocation[]> => {
      const client = clientRef.current;
      if (!client?.isReady()) {
        return [];
      }
      return client.getReferences(filePath, position, content);
    },
    []
  );

  // Get signature help
  const getSignatureHelp = useCallback(
    async (
      filePath: string,
      position: LSPPosition,
      content: string
    ): Promise<LSPSignatureHelp | null> => {
      const client = clientRef.current;
      if (!client?.isReady()) {
        return null;
      }
      return client.getSignatureHelp(filePath, position, content);
    },
    []
  );

  // Check if available for file
  const isAvailableForFile = useCallback((filePath: string): boolean => {
    const client = clientRef.current;
    return client?.isAvailableForFile(filePath) ?? false;
  }, []);

  // Refresh status
  const refreshStatus = useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    if (client) {
      const status = await client.getStatus();
      setServerStatus(status);
    }
  }, []);

  // Auto-start effect - wait for container to be ready before initializing
  useEffect(() => {
    if (autoStart && projectId && containerReady && !isReady && !isInitializing) {
      initialize();
    }
  }, [autoStart, projectId, containerReady, isReady, isInitializing, initialize]);

  // Cleanup on unmount or projectId change
  useEffect(() => {
    return () => {
      // Note: We don't dispose the client here because it might be shared
      // The client will be disposed when the project is closed
      clientRef.current = null;
    };
  }, [projectId]);

  return {
    isReady,
    isInitializing,
    error,
    serverStatus,
    initialize,
    stop,
    syncDocument,
    getCompletions,
    getHover,
    getDefinition,
    getReferences,
    getSignatureHelp,
    isAvailableForFile,
    refreshStatus,
  };
}

// ============================================
// File-specific Hook
// ============================================

export interface UseFileLSPOptions {
  /** Whether to auto-sync when content changes */
  autoSync?: boolean;
  /** Debounce time for auto-sync in ms */
  syncDebounce?: number;
}

export interface UseFileLSPResult extends Omit<UseLSPResult, 'syncDocument'> {
  /** Sync the current file */
  sync: () => Promise<boolean>;
  /** Get completions at a position in the current file */
  complete: (line: number, character: number, triggerCharacter?: string) => Promise<LSPCompletionItem[]>;
  /** Get hover at a position in the current file */
  hover: (line: number, character: number) => Promise<LSPHover | null>;
  /** Go to definition at a position in the current file */
  definition: (line: number, character: number) => Promise<LSPLocation[]>;
  /** Find references at a position in the current file */
  references: (line: number, character: number) => Promise<LSPLocation[]>;
}

/**
 * Hook for LSP operations on a specific file
 * Simplifies the API for file-specific operations
 */
export function useFileLSP(
  projectId: string | null | undefined,
  filePath: string | null | undefined,
  content: string,
  options: UseFileLSPOptions = {}
): UseFileLSPResult {
  const { autoSync = true, syncDebounce = 500 } = options;

  const lsp = useLSP(projectId);
  const lastContentRef = useRef<string>('');
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync current file
  const sync = useCallback(async (): Promise<boolean> => {
    if (!filePath || !content) {
      return false;
    }
    return lsp.syncDocument(filePath, content);
  }, [lsp, filePath, content]);

  // Auto-sync with debounce
  useEffect(() => {
    if (!autoSync || !filePath || !content || content === lastContentRef.current) {
      return;
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(() => {
      if (lsp.isReady) {
        lsp.syncDocument(filePath, content);
        lastContentRef.current = content;
      }
    }, syncDebounce);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [autoSync, filePath, content, syncDebounce, lsp]);

  // File-specific completion
  const complete = useCallback(
    async (line: number, character: number, triggerCharacter?: string): Promise<LSPCompletionItem[]> => {
      if (!filePath) return [];
      return lsp.getCompletions(filePath, { line, character }, content, triggerCharacter);
    },
    [lsp, filePath, content]
  );

  // File-specific hover
  const hover = useCallback(
    async (line: number, character: number): Promise<LSPHover | null> => {
      if (!filePath) return null;
      return lsp.getHover(filePath, { line, character }, content);
    },
    [lsp, filePath, content]
  );

  // File-specific definition
  const definition = useCallback(
    async (line: number, character: number): Promise<LSPLocation[]> => {
      if (!filePath) return [];
      return lsp.getDefinition(filePath, { line, character }, content);
    },
    [lsp, filePath, content]
  );

  // File-specific references
  const references = useCallback(
    async (line: number, character: number): Promise<LSPLocation[]> => {
      if (!filePath) return [];
      return lsp.getReferences(filePath, { line, character }, content);
    },
    [lsp, filePath, content]
  );

  return {
    ...lsp,
    sync,
    complete,
    hover,
    definition,
    references,
  };
}

export default useLSP;
