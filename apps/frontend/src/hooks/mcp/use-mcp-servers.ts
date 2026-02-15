import { useQuery } from '@tanstack/react-query';
import { requireSessionAccessToken } from '@/lib/auth/session-token';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

interface MCPServer {
  qualifiedName: string;
  displayName: string;
  description: string;
  createdAt: string;
  useCount: number;
  homepage: string;
  iconUrl?: string;
  isDeployed?: boolean;
  connections?: any[];
  tools?: any[];
  security?: any;
}

interface MCPServerDetailResponse {
  qualifiedName: string;
  displayName: string;
  iconUrl?: string;
  deploymentUrl?: string;
  connections: any[];
  security?: any;
  tools?: any[];
}

export const useMCPServerDetails = (qualifiedName: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['mcp-server-details', qualifiedName],
    queryFn: async (): Promise<MCPServerDetailResponse> => {
      const token = await requireSessionAccessToken();

      const response = await fetch(
        `${API_URL}/mcp/servers/${qualifiedName}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch MCP server details');
      }

      return response.json();
    },
    enabled: enabled && !!qualifiedName,
    staleTime: 10 * 60 * 1000,
  });
};
