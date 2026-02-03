/**
 * useChatSessions - React hook for chat session management
 *
 * Provides easy access to session state and actions in React components.
 * Wraps the nanostores with useStore and exposes common operations.
 */

import { useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { useNavigate } from '@remix-run/react';
import {
  filteredSessions,
  activeSession,
  sessionsByProject,
  favoriteSessions,
  recentSessions,
  sessionStats,
  searchQuery,
  setSearchQuery,
  isLoading,
  sessionsError,
  projectFilter,
  setProjectFilter,
  showArchived,
  toggleShowArchived,
  sortBy,
  sortOrder,
  setSortOptions,
  type ChatSessionMetadata,
} from '~/lib/stores/chat-sessions';
import {
  loadAllSessions,
  loadProjectSessions,
  createNewSession,
  renameSessionPersistent,
  deleteSessionPersistent,
  archiveSessionPersistent,
  duplicateSession,
  exportConversation,
  exportMultipleConversations,
  searchConversations,
  getAllTags,
} from '~/lib/persistence/useChatHistory';

export interface UseChatSessionsOptions {
  projectId?: string;
  autoLoad?: boolean;
}

export interface UseChatSessionsReturn {
  // State
  sessions: ChatSessionMetadata[];
  activeSession: ChatSessionMetadata | null;
  favorites: ChatSessionMetadata[];
  recent: ChatSessionMetadata[];
  stats: { total: number; active: number; archived: number; favorites: number };
  loading: boolean;
  error: string | null;

  // Search & Filter
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  projectFilter: string | null;
  setProjectFilter: (projectId: string | null) => void;
  showArchived: boolean;
  toggleShowArchived: () => void;
  search: (query: string) => Array<{
    session: ChatSessionMetadata;
    score: number;
    matches: string[];
  }>;

  // Sort
  sortBy: 'updatedAt' | 'createdAt' | 'title' | 'messageCount';
  sortOrder: 'asc' | 'desc';
  setSortOptions: (by: 'updatedAt' | 'createdAt' | 'title' | 'messageCount', order: 'asc' | 'desc') => void;

  // Actions
  loadSessions: () => Promise<ChatSessionMetadata[]>;
  createSession: (projectId?: string) => Promise<string | null>;
  renameSession: (sessionId: string, newTitle: string) => Promise<boolean>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  archiveSession: (sessionId: string) => Promise<boolean>;
  duplicateSession: (sessionId: string) => Promise<string | null>;
  exportSession: (sessionId: string) => Promise<void>;
  exportSessions: (sessionIds: string[]) => Promise<void>;
  getTags: () => string[];
  navigateToSession: (urlId: string) => void;
}

/**
 * Hook for managing chat sessions
 */
export function useChatSessions(
  options: UseChatSessionsOptions = {}
): UseChatSessionsReturn {
  const { projectId, autoLoad = true } = options;
  const navigate = useNavigate();

  // Subscribe to stores
  const sessions = useStore(filteredSessions);
  const active = useStore(activeSession);
  const favorites = useStore(favoriteSessions);
  const recent = useStore(recentSessions);
  const stats = useStore(sessionStats);
  const loading = useStore(isLoading);
  const error = useStore(sessionsError);
  const query = useStore(searchQuery);
  const filter = useStore(projectFilter);
  const archived = useStore(showArchived);
  const sort = useStore(sortBy);
  const order = useStore(sortOrder);

  // Auto-load sessions on mount
  useEffect(() => {
    if (autoLoad) {
      if (projectId) {
        loadProjectSessions(projectId);
        setProjectFilter(projectId);
      } else {
        loadAllSessions();
      }
    }
  }, [autoLoad, projectId]);

  // Actions
  const loadSessions = useCallback(() => {
    return projectId ? loadProjectSessions(projectId) : loadAllSessions();
  }, [projectId]);

  const createSession = useCallback(
    (customProjectId?: string) => {
      return createNewSession(customProjectId || projectId);
    },
    [projectId]
  );

  const renameSession = useCallback((sessionId: string, newTitle: string) => {
    return renameSessionPersistent(sessionId, newTitle);
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    return deleteSessionPersistent(sessionId);
  }, []);

  const archiveSession = useCallback((sessionId: string) => {
    return archiveSessionPersistent(sessionId);
  }, []);

  const duplicate = useCallback((sessionId: string) => {
    return duplicateSession(sessionId);
  }, []);

  const exportSession = useCallback((sessionId: string) => {
    return exportConversation(sessionId);
  }, []);

  const exportSessions = useCallback((sessionIds: string[]) => {
    return exportMultipleConversations(sessionIds);
  }, []);

  const search = useCallback(
    (searchQuery: string) => {
      return searchConversations(searchQuery, {
        projectId: filter || undefined,
        includeArchived: archived,
      });
    },
    [filter, archived]
  );

  const navigateToSession = useCallback(
    (urlId: string) => {
      navigate(`/chat/${urlId}`);
    },
    [navigate]
  );

  const setSortOptionsWrapper = useCallback(
    (by: 'updatedAt' | 'createdAt' | 'title' | 'messageCount', ord: 'asc' | 'desc') => {
      setSortOptions(by, ord);
    },
    []
  );

  return {
    // State
    sessions,
    activeSession: active,
    favorites,
    recent,
    stats,
    loading,
    error,

    // Search & Filter
    searchQuery: query,
    setSearchQuery,
    projectFilter: filter,
    setProjectFilter,
    showArchived: archived,
    toggleShowArchived,
    search,

    // Sort
    sortBy: sort,
    sortOrder: order,
    setSortOptions: setSortOptionsWrapper,

    // Actions
    loadSessions,
    createSession,
    renameSession,
    deleteSession,
    archiveSession,
    duplicateSession: duplicate,
    exportSession,
    exportSessions,
    getTags: getAllTags,
    navigateToSession,
  };
}

export default useChatSessions;
