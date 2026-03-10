import { requireSessionAccessToken } from "@/lib/auth/session-token";

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

async function getAuthHeaders(contentType = false): Promise<Record<string, string>> {
  const token = await requireSessionAccessToken();
  return contentType
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    : { 'Authorization': `Bearer ${token}` };
}

export type Agent = {
  agent_id: string;
  name: string;
  system_prompt: string;
  model?: string | null;
  configured_mcps: Array<{
    name: string;
    config: Record<string, any>;
  }>;
  custom_mcps?: Array<{
    name: string;
    type: 'json' | 'sse';
    config: Record<string, any>;
    enabledTools: string[];
  }>;
  agentpress_tools: Record<string, any>;
  is_default: boolean;
  is_public?: boolean;
  marketplace_published_at?: string;
  download_count?: number;
  tags?: string[];
  created_at: string;
  updated_at: string;
  icon_name?: string | null;
  icon_color?: string | null;
  icon_background?: string | null;
  current_version_id?: string | null;
  version_count?: number;
  current_version?: AgentVersion | null;
  metadata?: {
    template_name?: string;
    recoder_template_id?: string;
    is_recoder_team?: boolean;
    is_recoder_default?: boolean;
    is_suna_default?: boolean;
    centrally_managed?: boolean;
    management_version?: string;
    restrictions?: {
      system_prompt_editable?: boolean;
      tools_editable?: boolean;
      name_editable?: boolean;
      mcps_editable?: boolean;
    };
    installation_date?: string;
    last_central_update?: string;
  };
};

export type PaginationInfo = {
  current_page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
};

export type AgentsResponse = {
  agents: Agent[];
  pagination: PaginationInfo;
};

export type AgentsParams = {
  page?: number;
  limit?: number;
  search?: string;
  sort_by?: string;
  sort_order?: string;
  has_default?: boolean;
  has_mcp_tools?: boolean;
  has_agentpress_tools?: boolean;
  tools?: string;
  content_type?: string;
};

// Removed ThreadAgentResponse - agent info now derived from messages/agent runs

export type AgentCreateRequest = {
  name: string;
  description?: string;
  system_prompt?: string;
  configured_mcps?: Array<{
    name: string;
    config: Record<string, any>;
  }>;
  custom_mcps?: Array<{
    name: string;
    type: 'json' | 'sse';
    config: Record<string, any>;
    enabledTools: string[];
  }>;
  agentpress_tools?: Record<string, any>;
  is_default?: boolean;
  icon_name?: string | null;
  icon_color?: string | null;
  icon_background?: string | null;
};

export type AgentVersionCreateRequest = {
  system_prompt: string;
  model?: string;
  configured_mcps?: Array<{
    name: string;
    config: Record<string, any>;
  }>;
  custom_mcps?: Array<{
    name: string;
    type: 'json' | 'sse';
    config: Record<string, any>;
    enabledTools: string[];
  }>;
  agentpress_tools?: Record<string, any>;
  version_name?: string;
  description?: string;
};

export type AgentVersion = {
  version_id: string;
  agent_id: string;
  version_number: number;
  version_name: string;
  system_prompt: string;
  model?: string;  // Add model field
  configured_mcps: Array<any>;
  custom_mcps: Array<any>;
  agentpress_tools: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  change_description?: string;
};

export type AgentUpdateRequest = {
  name?: string;
  description?: string;
  system_prompt?: string;
  model?: string | null;
  configured_mcps?: Array<{
    name: string;
    config: Record<string, any>;
  }>;
  custom_mcps?: Array<{
    name: string;
    type: 'json' | 'sse';
    config: Record<string, any>;
    enabledTools: string[];
  }>;
  agentpress_tools?: Record<string, any>;
  is_default?: boolean;
  icon_name?: string | null;
  icon_color?: string | null;
  icon_background?: string | null;
  replace_mcps?: boolean;
};

export const getAgents = async (params: AgentsParams = {}): Promise<AgentsResponse> => {
  try {
    const queryParams = new URLSearchParams();
    // Only include page if it's > 1 (page 1 is default, so we don't need to send it)
    if (params.page && params.page > 1) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.sort_by) queryParams.append('sort_by', params.sort_by);
    if (params.sort_order) queryParams.append('sort_order', params.sort_order);
    if (params.has_default !== undefined) queryParams.append('has_default', params.has_default.toString());
    if (params.has_mcp_tools !== undefined) queryParams.append('has_mcp_tools', params.has_mcp_tools.toString());
    if (params.has_agentpress_tools !== undefined) queryParams.append('has_agentpress_tools', params.has_agentpress_tools.toString());
    if (params.tools) queryParams.append('tools', params.tools);
    if (params.content_type) queryParams.append('content_type', params.content_type);

    const url = `${API_URL}/agents${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: await getAuthHeaders(true),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (err) {
    throw err;
  }
};

export const getAgent = async (agentId: string): Promise<Agent> => {
  try {
    const response = await fetch(`${API_URL}/agents/${agentId}`, {
      method: 'GET',
      headers: await getAuthHeaders(true),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const agent = await response.json();
    return agent;
  } catch (err) {
    throw err;
  }
};

export const createAgent = async (agentData: AgentCreateRequest): Promise<Agent> => {
  try {
    const response = await fetch(`${API_URL}/agents`, {
      method: 'POST',
      headers: await getAuthHeaders(true),
      body: JSON.stringify(agentData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      const isAgentLimitError = (response.status === 402) && (
        errorData.error_code === 'AGENT_LIMIT_EXCEEDED' || 
        errorData.detail?.error_code === 'AGENT_LIMIT_EXCEEDED'
      );
      
      if (isAgentLimitError) {
        const { AgentCountLimitError } = await import('@/lib/api/errors');
        const errorDetail = errorData.detail || errorData;
        throw new AgentCountLimitError(response.status, errorDetail);
      }
      
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const agent = await response.json();
    return agent;
  } catch (err) {
    throw err;
  }
};

export const updateAgent = async (agentId: string, agentData: AgentUpdateRequest): Promise<Agent> => {
  try {
    const response = await fetch(`${API_URL}/agents/${agentId}`, {
      method: 'PUT',
      headers: await getAuthHeaders(true),
      body: JSON.stringify(agentData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP ${response.status}: {response.statusText}`);
    }

    const agent = await response.json();
    return agent;
  } catch (err) {
    throw err;
  }
};

export const deleteAgent = async (agentId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_URL}/agents/${agentId}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(true),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (err) {
    throw err;
  }
};

export const cloneAgent = async (agentId: string): Promise<Agent> => {
  try {
    const response = await fetch(`${API_URL}/agents/${agentId}/clone`, {
      method: 'POST',
      headers: await getAuthHeaders(true),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
    }

    const agent = await response.json();
    return agent;
  } catch (err) {
    throw err;
  }
};


export const getAgentVersions = async (agentId: string): Promise<AgentVersion[]> => {
  try {
    const response = await fetch(`${API_URL}/agents/${agentId}/versions`, {
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const versions = await response.json();
    return versions;
  } catch (err) {
    throw err;
  }
};

export const createAgentVersion = async (
  agentId: string,
  data: AgentVersionCreateRequest
): Promise<AgentVersion> => {
  try {
    const response = await fetch(`${API_URL}/agents/${agentId}/versions`, {
      method: 'POST',
      headers: await getAuthHeaders(true),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const version = await response.json();
    return version;
  } catch (err) {
    throw err;
  }
};

export const activateAgentVersion = async (
  agentId: string,
  versionId: string
): Promise<void> => {
  try {
    const response = await fetch(
      `${API_URL}/agents/${agentId}/versions/${versionId}/activate`,
      {
        method: 'PUT',
        headers: await getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (err) {
    throw err;
  }
};

export const getAgentVersion = async (
  agentId: string,
  versionId: string
): Promise<AgentVersion> => {
  try {
    const response = await fetch(
      `${API_URL}/agents/${agentId}/versions/${versionId}`,
      {
        headers: await getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const version = await response.json();
    return version;
  } catch (err) {
    throw err;
  }
};

export const updateAgentVersionDetails = async (
  agentId: string,
  versionId: string,
  data: { version_name?: string; change_description?: string }
): Promise<AgentVersion> => {
  try {
    const response = await fetch(
      `${API_URL}/agents/${agentId}/versions/${versionId}/details`,
      {
        method: 'PUT',
        headers: await getAuthHeaders(true),
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const version = await response.json();
    return version;
  } catch (err) {
    throw err;
  }
};
  
