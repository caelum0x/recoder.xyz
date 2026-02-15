/**
 * useThemes — React hook for theme management.
 * Handles theme CRUD, per-project assignment, and AI theme generation.
 */

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { dockerGet, dockerPost, dockerPut, dockerDelete } from '~/lib/services/docker-api';
import { workbenchStore } from '~/lib/stores/workbench';

// ── Types ──────────────────────────────────────────────────────────

export interface BuiltinTheme {
  id: string;
  name: string;
  description: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  description: string;
  prompt: string;
  createdAt: number;
  updatedAt: number;
}

export interface GenerateThemeParams {
  images: string[]; // base64
  keywords: string;
  generationMode: 'inspired' | 'high-fidelity';
  model: string;
  apiKey: string;
  provider: 'anthropic' | 'openai' | 'google' | 'openrouter';
}

// ── Hook ───────────────────────────────────────────────────────────

export function useThemes() {
  const projectId = useStore(workbenchStore.projectId);

  const [builtinThemes, setBuiltinThemes] = useState<BuiltinTheme[]>([]);
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [projectThemeId, setProjectThemeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Load themes on mount
  useEffect(() => {
    refresh();
  }, []);

  // Load project theme when projectId changes
  useEffect(() => {
    if (projectId) {
      loadProjectTheme();
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await dockerGet<{
        builtinThemes: BuiltinTheme[];
        customThemes: CustomTheme[];
      }>('/api/themes');
      setBuiltinThemes(data.builtinThemes || []);
      setCustomThemes(data.customThemes || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadProjectTheme = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await dockerGet<{ themeId: string | null }>(
        `/api/themes/project/${projectId}`,
      );
      setProjectThemeId(data.themeId);
    } catch {
      setProjectThemeId(null);
    }
  }, [projectId]);

  const createTheme = useCallback(async (
    name: string,
    description: string,
    prompt: string,
  ): Promise<CustomTheme> => {
    setIsLoading(true);
    try {
      const data = await dockerPost<{ theme: CustomTheme }>('/api/themes', {
        name,
        description,
        prompt,
      });
      await refresh();
      return data.theme;
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  const updateTheme = useCallback(async (
    id: string,
    updates: Partial<Pick<CustomTheme, 'name' | 'description' | 'prompt'>>,
  ) => {
    setIsLoading(true);
    try {
      await dockerPut(`/api/themes/${id}`, updates);
      await refresh();
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  const deleteTheme = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      await dockerDelete(`/api/themes/${id}`);
      await refresh();
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  const setProjectTheme = useCallback(async (themeId: string) => {
    if (!projectId) return;
    try {
      await dockerPost(`/api/themes/project/${projectId}`, { themeId });
      setProjectThemeId(themeId);
    } catch {
      // ignore
    }
  }, [projectId]);

  const removeProjectTheme = useCallback(async () => {
    if (!projectId) return;
    try {
      await dockerDelete(`/api/themes/project/${projectId}`);
      setProjectThemeId(null);
    } catch {
      // ignore
    }
  }, [projectId]);

  const generateTheme = useCallback(async (params: GenerateThemeParams): Promise<string> => {
    setIsGenerating(true);
    try {
      const data = await dockerPost<{ prompt: string }>(
        '/api/themes/generate',
        params,
        { timeout: 120000 },
      );
      return data.prompt;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    builtinThemes,
    customThemes,
    projectThemeId,
    createTheme,
    updateTheme,
    deleteTheme,
    setProjectTheme,
    removeProjectTheme,
    generateTheme,
    isGenerating,
    isLoading,
    refresh,
  };
}
