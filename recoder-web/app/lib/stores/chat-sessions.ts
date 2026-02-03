/**
 * Chat Sessions Store - Manages multiple chat conversations per project
 * Inspired by december's session management approach
 *
 * Features:
 * - Session state management with nanostores
 * - Active session tracking
 * - Session metadata (title, created, updated, message count)
 * - Project-scoped conversations
 * - Search and filtering capabilities
 */

import { atom, map, computed } from 'nanostores';
import type { Message } from 'ai';

// ==================== TYPES ====================

export interface ChatSessionMetadata {
  id: string;
  urlId: string;
  projectId?: string;
  title: string;
  description?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
  isArchived: boolean;
  isFavorite: boolean;
  tags?: string[];
  source?: 'web' | 'cli';
  // For quick preview without loading full messages
  firstUserMessage?: string;
  lastAssistantMessage?: string;
}

export interface ChatSession extends ChatSessionMetadata {
  messages: Message[];
  fileSnapshot?: Record<string, string>;
}

export interface SessionsState {
  sessions: Map<string, ChatSessionMetadata>;
  activeSessionId: string | null;
  projectFilter: string | null;
  searchQuery: string;
  sortBy: 'updatedAt' | 'createdAt' | 'title' | 'messageCount';
  sortOrder: 'asc' | 'desc';
  showArchived: boolean;
  isLoading: boolean;
  error: string | null;
}

// ==================== STORES ====================

/**
 * Main sessions map - holds metadata for all loaded sessions
 * Key is sessionId, value is metadata
 */
export const sessionsMap = map<Record<string, ChatSessionMetadata>>({});

/**
 * Currently active session ID
 */
export const activeSessionId = atom<string | null>(null);

/**
 * Current project filter - when set, only shows sessions for this project
 */
export const projectFilter = atom<string | null>(null);

/**
 * Search query for filtering sessions
 */
export const searchQuery = atom<string>('');

/**
 * Sort configuration
 */
export const sortBy = atom<'updatedAt' | 'createdAt' | 'title' | 'messageCount'>('updatedAt');
export const sortOrder = atom<'asc' | 'desc'>('desc');

/**
 * Show archived sessions
 */
export const showArchived = atom<boolean>(false);

/**
 * Loading state
 */
export const isLoading = atom<boolean>(false);

/**
 * Error state
 */
export const sessionsError = atom<string | null>(null);

/**
 * Sessions being renamed (for inline editing)
 */
export const renamingSessionId = atom<string | null>(null);

// ==================== COMPUTED STORES ====================

/**
 * Get all sessions as array, filtered and sorted
 */
export const filteredSessions = computed(
  [sessionsMap, projectFilter, searchQuery, sortBy, sortOrder, showArchived],
  (sessions, project, query, sort, order, includeArchived) => {
    let result = Object.values(sessions);

    // Filter by project
    if (project) {
      result = result.filter(s => s.projectId === project);
    }

    // Filter archived
    if (!includeArchived) {
      result = result.filter(s => !s.isArchived);
    }

    // Filter by search query
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      result = result.filter(s =>
        s.title.toLowerCase().includes(lowerQuery) ||
        s.description?.toLowerCase().includes(lowerQuery) ||
        s.firstUserMessage?.toLowerCase().includes(lowerQuery) ||
        s.tags?.some(t => t.toLowerCase().includes(lowerQuery))
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sort) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'messageCount':
          comparison = a.messageCount - b.messageCount;
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
        default:
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
      }

      return order === 'desc' ? -comparison : comparison;
    });

    return result;
  }
);

/**
 * Get active session metadata
 */
export const activeSession = computed(
  [sessionsMap, activeSessionId],
  (sessions, activeId) => {
    if (!activeId) return null;
    return sessions[activeId] || null;
  }
);

/**
 * Get sessions grouped by project
 */
export const sessionsByProject = computed(
  [sessionsMap, showArchived],
  (sessions, includeArchived) => {
    const byProject = new Map<string, ChatSessionMetadata[]>();
    const noProject: ChatSessionMetadata[] = [];

    for (const session of Object.values(sessions)) {
      if (!includeArchived && session.isArchived) continue;

      if (session.projectId) {
        const existing = byProject.get(session.projectId) || [];
        existing.push(session);
        byProject.set(session.projectId, existing);
      } else {
        noProject.push(session);
      }
    }

    // Sort sessions within each project by updatedAt
    for (const [projectId, projectSessions] of byProject) {
      projectSessions.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }
    noProject.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return { byProject, noProject };
  }
);

/**
 * Get favorite sessions
 */
export const favoriteSessions = computed(
  [sessionsMap],
  (sessions) => {
    return Object.values(sessions)
      .filter(s => s.isFavorite && !s.isArchived)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
);

/**
 * Get recent sessions (last 7 days)
 */
export const recentSessions = computed(
  [sessionsMap],
  (sessions) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return Object.values(sessions)
      .filter(s => !s.isArchived && new Date(s.updatedAt) >= sevenDaysAgo)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
);

/**
 * Session count stats
 */
export const sessionStats = computed(
  [sessionsMap],
  (sessions) => {
    const all = Object.values(sessions);
    return {
      total: all.length,
      active: all.filter(s => !s.isArchived).length,
      archived: all.filter(s => s.isArchived).length,
      favorites: all.filter(s => s.isFavorite).length,
    };
  }
);

// ==================== ACTIONS ====================

/**
 * Add or update a session in the store
 */
export function setSession(session: ChatSessionMetadata): void {
  const current = sessionsMap.get();
  sessionsMap.set({
    ...current,
    [session.id]: session,
  });
}

/**
 * Add multiple sessions (bulk update)
 */
export function setSessions(sessions: ChatSessionMetadata[]): void {
  const current = sessionsMap.get();
  const newMap = { ...current };

  for (const session of sessions) {
    newMap[session.id] = session;
  }

  sessionsMap.set(newMap);
}

/**
 * Remove a session from the store
 */
export function removeSession(sessionId: string): void {
  const current = sessionsMap.get();
  const { [sessionId]: removed, ...rest } = current;
  sessionsMap.set(rest);

  // Clear active session if it was removed
  if (activeSessionId.get() === sessionId) {
    activeSessionId.set(null);
  }
}

/**
 * Set the active session
 */
export function setActiveSession(sessionId: string | null): void {
  activeSessionId.set(sessionId);
}

/**
 * Update session metadata
 */
export function updateSessionMetadata(
  sessionId: string,
  updates: Partial<ChatSessionMetadata>
): void {
  const current = sessionsMap.get();
  const session = current[sessionId];

  if (session) {
    sessionsMap.set({
      ...current,
      [sessionId]: {
        ...session,
        ...updates,
        updatedAt: new Date().toISOString(),
      },
    });
  }
}

/**
 * Rename a session
 */
export function renameSession(sessionId: string, newTitle: string): void {
  updateSessionMetadata(sessionId, { title: newTitle });
}

/**
 * Archive a session
 */
export function archiveSession(sessionId: string): void {
  updateSessionMetadata(sessionId, { isArchived: true });
}

/**
 * Unarchive a session
 */
export function unarchiveSession(sessionId: string): void {
  updateSessionMetadata(sessionId, { isArchived: false });
}

/**
 * Toggle favorite status
 */
export function toggleFavorite(sessionId: string): void {
  const session = sessionsMap.get()[sessionId];
  if (session) {
    updateSessionMetadata(sessionId, { isFavorite: !session.isFavorite });
  }
}

/**
 * Add tag to session
 */
export function addTag(sessionId: string, tag: string): void {
  const session = sessionsMap.get()[sessionId];
  if (session) {
    const tags = session.tags || [];
    if (!tags.includes(tag)) {
      updateSessionMetadata(sessionId, { tags: [...tags, tag] });
    }
  }
}

/**
 * Remove tag from session
 */
export function removeTag(sessionId: string, tag: string): void {
  const session = sessionsMap.get()[sessionId];
  if (session && session.tags) {
    updateSessionMetadata(sessionId, {
      tags: session.tags.filter(t => t !== tag)
    });
  }
}

/**
 * Set project filter
 */
export function setProjectFilter(projectId: string | null): void {
  projectFilter.set(projectId);
}

/**
 * Set search query
 */
export function setSearchQuery(query: string): void {
  searchQuery.set(query);
}

/**
 * Set sort options
 */
export function setSortOptions(
  by: 'updatedAt' | 'createdAt' | 'title' | 'messageCount',
  order: 'asc' | 'desc'
): void {
  sortBy.set(by);
  sortOrder.set(order);
}

/**
 * Toggle show archived
 */
export function toggleShowArchived(): void {
  showArchived.set(!showArchived.get());
}

/**
 * Start renaming a session
 */
export function startRenaming(sessionId: string): void {
  renamingSessionId.set(sessionId);
}

/**
 * Stop renaming
 */
export function stopRenaming(): void {
  renamingSessionId.set(null);
}

/**
 * Clear all sessions (for logout/cleanup)
 */
export function clearSessions(): void {
  sessionsMap.set({});
  activeSessionId.set(null);
  searchQuery.set('');
  projectFilter.set(null);
  isLoading.set(false);
  sessionsError.set(null);
}

/**
 * Set loading state
 */
export function setLoading(loading: boolean): void {
  isLoading.set(loading);
}

/**
 * Set error state
 */
export function setError(error: string | null): void {
  sessionsError.set(error);
}

// ==================== MARKDOWN EXPORT ====================

/**
 * Generate markdown export for a session
 */
export function generateSessionMarkdown(
  session: ChatSessionMetadata,
  messages: Message[]
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${session.title}`);
  lines.push('');

  // Metadata
  lines.push('## Session Information');
  lines.push('');
  lines.push(`- **Created:** ${new Date(session.createdAt).toLocaleString()}`);
  lines.push(`- **Last Updated:** ${new Date(session.updatedAt).toLocaleString()}`);
  lines.push(`- **Messages:** ${session.messageCount}`);
  if (session.projectId) {
    lines.push(`- **Project ID:** ${session.projectId}`);
  }
  if (session.tags && session.tags.length > 0) {
    lines.push(`- **Tags:** ${session.tags.join(', ')}`);
  }
  lines.push('');

  // Conversation
  lines.push('## Conversation');
  lines.push('');

  for (const message of messages) {
    const role = message.role === 'user' ? 'User' : 'Assistant';
    const timestamp = message.createdAt
      ? new Date(message.createdAt).toLocaleString()
      : '';

    lines.push(`### ${role}${timestamp ? ` (${timestamp})` : ''}`);
    lines.push('');
    lines.push(message.content);
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`*Exported from Recoder on ${new Date().toLocaleString()}*`);

  return lines.join('\n');
}

/**
 * Export session as downloadable markdown file
 */
export function exportSessionAsMarkdown(
  session: ChatSessionMetadata,
  messages: Message[]
): void {
  const markdown = generateSessionMarkdown(session, messages);
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${session.id}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export multiple sessions as a single markdown file
 */
export function exportMultipleSessionsAsMarkdown(
  sessions: Array<{ metadata: ChatSessionMetadata; messages: Message[] }>
): void {
  const lines: string[] = [];

  lines.push('# Recoder Chat Export');
  lines.push('');
  lines.push(`*Exported ${sessions.length} conversations on ${new Date().toLocaleString()}*`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const { metadata, messages } of sessions) {
    lines.push(generateSessionMarkdown(metadata, messages));
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const markdown = lines.join('\n');
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `recoder_chat_export_${new Date().toISOString().split('T')[0]}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==================== SEARCH ====================

/**
 * Search across all sessions
 * Returns sessions matching the query with relevance score
 */
export function searchSessions(
  query: string,
  options: {
    includeArchived?: boolean;
    projectId?: string;
    limit?: number;
  } = {}
): Array<{ session: ChatSessionMetadata; score: number; matches: string[] }> {
  const { includeArchived = false, projectId, limit = 50 } = options;
  const sessions = Object.values(sessionsMap.get());
  const lowerQuery = query.toLowerCase().trim();

  if (!lowerQuery) return [];

  const results: Array<{ session: ChatSessionMetadata; score: number; matches: string[] }> = [];

  for (const session of sessions) {
    // Skip archived if not included
    if (!includeArchived && session.isArchived) continue;

    // Skip if project filter doesn't match
    if (projectId && session.projectId !== projectId) continue;

    let score = 0;
    const matches: string[] = [];

    // Title match (highest weight)
    if (session.title.toLowerCase().includes(lowerQuery)) {
      score += 10;
      matches.push('title');
    }

    // Description match
    if (session.description?.toLowerCase().includes(lowerQuery)) {
      score += 5;
      matches.push('description');
    }

    // First user message match
    if (session.firstUserMessage?.toLowerCase().includes(lowerQuery)) {
      score += 3;
      matches.push('message');
    }

    // Tag match
    if (session.tags?.some(t => t.toLowerCase().includes(lowerQuery))) {
      score += 7;
      matches.push('tag');
    }

    if (score > 0) {
      results.push({ session, score, matches });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

// ==================== PERSISTENCE HELPERS ====================

/**
 * Convert API response to session metadata
 */
export function apiResponseToMetadata(apiSession: any): ChatSessionMetadata {
  return {
    id: apiSession.id,
    urlId: apiSession.urlId,
    projectId: apiSession.projectId,
    title: apiSession.title || apiSession.description || 'Untitled Chat',
    description: apiSession.description,
    messageCount: apiSession.messageCount || apiSession.totalMessages || 0,
    createdAt: apiSession.createdAt || apiSession.timestamp,
    updatedAt: apiSession.updatedAt || apiSession.timestamp,
    lastMessageAt: apiSession.lastMessageAt,
    isArchived: apiSession.isArchived || false,
    isFavorite: apiSession.isFavorite || false,
    tags: apiSession.tags || [],
    source: apiSession.metadata?.source || 'web',
    firstUserMessage: apiSession.firstUserMessage,
    lastAssistantMessage: apiSession.lastAssistantMessage,
  };
}

/**
 * Get session for a specific project
 */
export function getSessionsForProject(projectId: string): ChatSessionMetadata[] {
  return Object.values(sessionsMap.get())
    .filter(s => s.projectId === projectId && !s.isArchived)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Check if a session exists
 */
export function sessionExists(sessionId: string): boolean {
  return sessionId in sessionsMap.get();
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): ChatSessionMetadata | null {
  return sessionsMap.get()[sessionId] || null;
}

/**
 * Get session by URL ID
 */
export function getSessionByUrlId(urlId: string): ChatSessionMetadata | null {
  const sessions = Object.values(sessionsMap.get());
  return sessions.find(s => s.urlId === urlId) || null;
}
