/**
 * Context Management Hook
 * Provides React integration for the context management system
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { createScopedLogger } from '~/utils/logger';
import {
  contextConfigStore,
  conversationMessagesStore,
  fileContextStore,
  totalTokensStore,
  isCondensing,
  tokenUsagePercentage,
  availableTokens,
  needsCondensation,
  sortedMessages,
  addMessage,
  updateMessage,
  removeMessage,
  getMessages,
  getVisibleMessages,
  truncateConversation,
  restoreTruncation,
  generateCondensationPrompt,
  applyCondensation,
  getMessagesToCondense,
  setFileContext,
  markFileContextStale,
  removeFileContext,
  getFileContexts,
  getStaleFileContexts,
  clearContext,
  resetContext,
  getContextStats,
  formatContextStats,
  type MessageRole,
  type ConversationMessage,
  type ContextConfig,
  type FileContext,
} from '~/lib/services/context-management';

const logger = createScopedLogger('ContextManagement');

export interface UseContextManagementOptions {
  autoCondense?: boolean;
  onCondensationNeeded?: (messages: ConversationMessage[]) => Promise<string>;
}

export interface UseContextManagementReturn {
  // State
  messages: ConversationMessage[];
  visibleMessages: ConversationMessage[];
  totalTokens: number;
  usagePercentage: number;
  available: number;
  needsCondensation: boolean;
  isCondensing: boolean;
  config: ContextConfig;
  fileContexts: FileContext[];
  staleFiles: FileContext[];

  // Message actions
  addMessage: (role: MessageRole, content: string) => ConversationMessage;
  updateMessage: (id: string, updates: Partial<ConversationMessage>) => void;
  removeMessage: (id: string) => void;

  // Context actions
  truncate: (keepRecentCount?: number) => string | null;
  restore: (truncationId: string) => number;
  condense: () => Promise<ConversationMessage | null>;
  clear: () => void;
  reset: (systemPrompt?: string) => void;

  // File context actions
  addFile: (path: string, content: string, source?: 'user' | 'ai' | 'system') => void;
  markStale: (path: string) => void;
  removeFile: (path: string) => void;
  refreshStaleFiles: (fetchContent: (path: string) => Promise<string>) => Promise<void>;

  // Stats
  stats: ReturnType<typeof getContextStats>;
  formattedStats: string;
}

/**
 * Hook for managing conversation context
 */
export function useContextManagement(
  options: UseContextManagementOptions = {}
): UseContextManagementReturn {
  const { autoCondense = false, onCondensationNeeded } = options;

  // Subscribe to stores
  const config = useStore(contextConfigStore);
  const messagesMap = useStore(conversationMessagesStore);
  const fileContextMap = useStore(fileContextStore);
  const totalTokens = useStore(totalTokensStore);
  const condensing = useStore(isCondensing);
  const usagePercent = useStore(tokenUsagePercentage);
  const available = useStore(availableTokens);
  const needsCondense = useStore(needsCondensation);
  const messages = useStore(sortedMessages);

  // Derived state
  const visibleMessages = useMemo(
    () => messages.filter(m => !m.truncated),
    [messages]
  );

  const fileContexts = useMemo(
    () => Object.values(fileContextMap).filter(Boolean) as FileContext[],
    [fileContextMap]
  );

  const staleFiles = useMemo(
    () => fileContexts.filter(f => f.isStale),
    [fileContexts]
  );

  const stats = useMemo(() => getContextStats(), [totalTokens, messagesMap, fileContextMap]);
  const formattedStats = useMemo(() => formatContextStats(), [stats]);

  // Auto-condensation effect
  useEffect(() => {
    if (!autoCondense || !needsCondense || condensing || !onCondensationNeeded) {
      return;
    }

    const messagesToCondense = getMessagesToCondense();
    if (!messagesToCondense) return;

    // Trigger condensation
    (async () => {
      isCondensing.set(true);
      try {
        const prompt = generateCondensationPrompt(messagesToCondense);
        const summary = await onCondensationNeeded(messagesToCondense);
        applyCondensation(
          messagesToCondense.map(m => m.id),
          summary
        );
      } catch (error) {
        logger.error('Auto-condensation failed:', error);
      } finally {
        isCondensing.set(false);
      }
    })();
  }, [autoCondense, needsCondense, condensing, onCondensationNeeded]);

  // Actions
  const handleAddMessage = useCallback(
    (role: MessageRole, content: string) => addMessage(role, content),
    []
  );

  const handleUpdateMessage = useCallback(
    (id: string, updates: Partial<ConversationMessage>) => updateMessage(id, updates),
    []
  );

  const handleRemoveMessage = useCallback(
    (id: string) => removeMessage(id),
    []
  );

  const handleTruncate = useCallback(
    (keepRecentCount?: number) => truncateConversation(keepRecentCount),
    []
  );

  const handleRestore = useCallback(
    (truncationId: string) => restoreTruncation(truncationId),
    []
  );

  const handleCondense = useCallback(async () => {
    if (!onCondensationNeeded) {
      logger.warn('No onCondensationNeeded handler provided');
      return null;
    }

    const messagesToCondense = getMessagesToCondense();
    if (!messagesToCondense) {
      return null;
    }

    isCondensing.set(true);
    try {
      const summary = await onCondensationNeeded(messagesToCondense);
      return applyCondensation(
        messagesToCondense.map(m => m.id),
        summary
      );
    } finally {
      isCondensing.set(false);
    }
  }, [onCondensationNeeded]);

  const handleClear = useCallback(() => clearContext(), []);
  const handleReset = useCallback((systemPrompt?: string) => resetContext(systemPrompt), []);

  const handleAddFile = useCallback(
    (path: string, content: string, source: 'user' | 'ai' | 'system' = 'user') =>
      setFileContext(path, content, source),
    []
  );

  const handleMarkStale = useCallback(
    (path: string) => markFileContextStale(path),
    []
  );

  const handleRemoveFile = useCallback(
    (path: string) => removeFileContext(path),
    []
  );

  const handleRefreshStaleFiles = useCallback(
    async (fetchContent: (path: string) => Promise<string>) => {
      const stale = getStaleFileContexts();
      await Promise.all(
        stale.map(async (file) => {
          try {
            const content = await fetchContent(file.path);
            setFileContext(file.path, content, file.source);
          } catch (error) {
            logger.error(`Failed to refresh ${file.path}:`, error);
          }
        })
      );
    },
    []
  );

  return {
    // State
    messages,
    visibleMessages,
    totalTokens,
    usagePercentage: usagePercent,
    available,
    needsCondensation: needsCondense,
    isCondensing: condensing,
    config,
    fileContexts,
    staleFiles,

    // Message actions
    addMessage: handleAddMessage,
    updateMessage: handleUpdateMessage,
    removeMessage: handleRemoveMessage,

    // Context actions
    truncate: handleTruncate,
    restore: handleRestore,
    condense: handleCondense,
    clear: handleClear,
    reset: handleReset,

    // File context actions
    addFile: handleAddFile,
    markStale: handleMarkStale,
    removeFile: handleRemoveFile,
    refreshStaleFiles: handleRefreshStaleFiles,

    // Stats
    stats,
    formattedStats,
  };
}

export default useContextManagement;
