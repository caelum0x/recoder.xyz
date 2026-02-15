/**
 * Tools Metadata Hook
 *
 * Fetches tools metadata from the backend API
 * Similar to frontend/src/hooks/tools/use-tools-metadata.ts
 */

import { useQuery } from '@tanstack/react-query';
import { parseToolsMetadataResponse } from '@/api/contracts';
import { API_URL, getAuthHeaders } from '@/api/config';

export interface ToolMethod {
  name: string;
  display_name: string;
  description: string;
  enabled: boolean;
  is_core?: boolean;
  visible?: boolean;
}

export interface ToolMetadata {
  name: string;
  display_name: string;
  description: string;
  tool_class: string;
  icon?: string;
  color?: string;
  enabled: boolean;
  is_core?: boolean;
  weight?: number;
  visible?: boolean;
  methods: ToolMethod[];
}

export interface ToolsMetadataResponse {
  success: boolean;
  tools: Record<string, ToolMetadata>;
}

const toolsMetadataKeys = {
  all: ['tools', 'metadata'] as const,
};

/**
 * Hook to fetch all tools metadata from the backend API
 */
export function useToolsMetadata() {
  return useQuery<ToolsMetadataResponse>({
    queryKey: toolsMetadataKeys.all,
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/tools`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tools metadata');
      }

      const parsed = parseToolsMetadataResponse(await response.json().catch(() => null));
      if (!parsed) {
        throw new Error('Failed to fetch tools metadata');
      }

      return {
        success: parsed.success,
        tools: parsed.tools as Record<string, ToolMetadata>
      };
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
  });
}




