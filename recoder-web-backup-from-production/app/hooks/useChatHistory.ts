/**
 * Chat History Hook
 * Provides access to database-backed chat history
 */

import { useState, useEffect, useCallback } from 'react';
import type { Message } from 'ai';

export interface ChatHistoryItem {
  id: string;
  urlId: string;
  description: string;
  timestamp: string;
  messageCount: number;
}

export interface UseChatHistoryOptions {
  userId?: string;
  anonymousId?: string;
  limit?: number;
}

export function useChatHistory({ userId, anonymousId, limit = 50 }: UseChatHistoryOptions = {}) {
  const [history, setHistory] = useState<ChatHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load chat history from database
   */
  const loadHistory = useCallback(async () => {
    if (!userId && !anonymousId) {
      setHistory([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (userId) params.append('userId', userId);
      if (anonymousId) params.append('anonymousId', anonymousId);
      params.append('limit', limit.toString());

      const response = await fetch(`/api/chat-history?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setHistory(data.data);
      } else {
        throw new Error(data.error || 'Failed to load history');
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setIsLoading(false);
    }
  }, [userId, anonymousId, limit]);

  /**
   * Save chat session to database
   */
  const saveChat = useCallback(async (data: {
    urlId: string;
    title?: string;
    description?: string;
    messages: Message[];
    artifactId?: string;
  }) => {
    try {
      const response = await fetch('/api/chat-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          anonymousId,
          ...data,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Reload history to get updated list
        await loadHistory();
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to save chat');
      }
    } catch (err) {
      console.error('Failed to save chat:', err);
      throw err;
    }
  }, [userId, anonymousId, loadHistory]);

  /**
   * Delete a chat session
   */
  const deleteChat = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch('/api/chat-history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      const result = await response.json();

      if (result.success) {
        // Reload history to get updated list
        await loadHistory();
      } else {
        throw new Error(result.error || 'Failed to delete chat');
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
      throw err;
    }
  }, [loadHistory]);

  /**
   * Claim anonymous sessions when user logs in
   */
  const claimSessions = useCallback(async (newUserId: string, oldAnonymousId: string) => {
    try {
      const response = await fetch('/api/chat-history/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: newUserId,
          anonymousId: oldAnonymousId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log(`Claimed ${result.claimedCount} sessions`);
        await loadHistory();
        return result.claimedCount;
      } else {
        throw new Error(result.error || 'Failed to claim sessions');
      }
    } catch (err) {
      console.error('Failed to claim sessions:', err);
      throw err;
    }
  }, [loadHistory]);

  // Load history when component mounts or when userId/anonymousId changes
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    history,
    isLoading,
    error,
    loadHistory,
    saveChat,
    deleteChat,
    claimSessions,
  };
}

/**
 * Get anonymous ID for tracking sessions before login
 */
export function getAnonymousId(): string {
  const key = 'recoder_anonymous_id';
  
  let id = localStorage.getItem(key);
  
  if (!id) {
    id = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem(key, id);
  }
  
  return id;
}

/**
 * Clear anonymous ID (call when user logs in)
 */
export function clearAnonymousId(): void {
  localStorage.removeItem('recoder_anonymous_id');
}
