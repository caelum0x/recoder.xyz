/**
 * usePrompts — React hook for Prompt Library management.
 * Handles CRUD for reusable prompts that can be referenced via @prompt:id in chat.
 */

import { useState, useCallback, useEffect } from 'react';
import { dockerGet, dockerPost, dockerPut, dockerDelete } from '~/lib/services/docker-api';

// ── Types ──────────────────────────────────────────────────────────

export interface Prompt {
  id: string;
  title: string;
  description: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

// ── Hook ───────────────────────────────────────────────────────────

export function usePrompts() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await dockerGet<{ prompts: Prompt[] }>('/api/prompts');
      setPrompts(data.prompts || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    refresh();
  }, []);

  const createPrompt = useCallback(async (
    title: string,
    description: string,
    content: string,
  ): Promise<Prompt> => {
    setIsLoading(true);
    try {
      const data = await dockerPost<{ prompt: Prompt }>('/api/prompts', {
        title,
        description,
        content,
      });
      await refresh();
      return data.prompt;
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  const updatePrompt = useCallback(async (
    id: string,
    updates: Partial<Pick<Prompt, 'title' | 'description' | 'content'>>,
  ): Promise<void> => {
    setIsLoading(true);
    try {
      await dockerPut(`/api/prompts/${id}`, updates);
      await refresh();
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  const deletePrompt = useCallback(async (id: string): Promise<void> => {
    setIsLoading(true);
    try {
      await dockerDelete(`/api/prompts/${id}`);
      await refresh();
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  return {
    prompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    isLoading,
    refresh,
  };
}
