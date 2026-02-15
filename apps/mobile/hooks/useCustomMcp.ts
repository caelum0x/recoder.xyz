import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/api/config';
import { parseApiErrorMessage, parseCustomMcpResponse } from '@/api/contracts';
import { requireSessionAccessToken } from '@/lib/auth/session-token';

interface CustomMcpTool {
  name: string;
  description: string;
  parameters?: any;
}

interface CustomMcpConfig {
  url: string;
  type?: 'http' | 'sse';
  headers?: Record<string, string>;
}

interface CustomMcpResponse {
  success: boolean;
  tools: CustomMcpTool[];
  serverName?: string;
  processedConfig?: any;
  message?: string;
}

interface CustomMcpDiscoverRequest {
  type: string;
  config: CustomMcpConfig;
}

interface CustomMcpUpdateRequest {
  agentId: string;
  url: string;
  type: string;
  enabled_tools: string[];
  name?: string;
}

const customMcpKeys = {
  all: ['custom-mcp'] as const,
  tools: (agentId: string, url: string) => [...customMcpKeys.all, 'tools', agentId, url] as const,
  discover: (url: string, type: string) => [...customMcpKeys.all, 'discover', url, type] as const,
};

async function getAuthHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await requireSessionAccessToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

const useCustomMcpTools = (agentId: string, config: CustomMcpConfig) => {
  return useQuery({
    queryKey: customMcpKeys.tools(agentId, config.url),
    queryFn: async () => {
      const headers = await getAuthHeaders({
        'X-MCP-URL': config.url,
        'X-MCP-Type': config.type || 'http',
      });

      if (config.headers) {
        headers['X-MCP-Headers'] = JSON.stringify(config.headers);
      }

      const response = await fetch(`${API_URL}/agents/${agentId}/custom-mcp-tools`, {
        headers,
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(parseApiErrorMessage(errorPayload) || 'Failed to fetch custom MCP tools');
      }

      const parsed = parseCustomMcpResponse(await response.json().catch(() => null));
      if (!parsed) {
        throw new Error('Invalid custom MCP tools response payload');
      }
      return parsed;
    },
    enabled: !!agentId && !!config.url,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

const useDiscoverCustomMcpTools = () => {
  return useMutation({
    mutationFn: async (request: CustomMcpDiscoverRequest): Promise<CustomMcpResponse> => {
      const headers = await getAuthHeaders();

      const response = await fetch(`${API_URL}/mcp/discover-custom-tools`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(parseApiErrorMessage(errorPayload) || 'Failed to discover custom MCP tools');
      }

      const parsed = parseCustomMcpResponse(await response.json().catch(() => null));
      if (!parsed) {
        throw new Error('Invalid custom MCP discover response payload');
      }
      return parsed;
    },
  });
};

const useUpdateCustomMcpTools = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CustomMcpUpdateRequest) => {
      const headers = await getAuthHeaders();

      const { agentId, ...body } = request;

      const response = await fetch(`${API_URL}/agents/${agentId}/custom-mcp-tools`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(parseApiErrorMessage(errorPayload) || 'Failed to update custom MCP tools');
      }

      const parsed = parseCustomMcpResponse(await response.json().catch(() => null));
      if (!parsed) {
        throw new Error('Invalid custom MCP update response payload');
      }
      return parsed;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: customMcpKeys.tools(variables.agentId, variables.url) 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['agents', 'detail', variables.agentId] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['agent-tools', variables.agentId] 
      });
    },
  });
};

export {
  useCustomMcpTools,
  useDiscoverCustomMcpTools,
  useUpdateCustomMcpTools,
  customMcpKeys,
  type CustomMcpTool,
  type CustomMcpConfig,
  type CustomMcpResponse,
  type CustomMcpDiscoverRequest,
  type CustomMcpUpdateRequest,
};
