import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface SectionPreview {
  section: string;
  item_count: number;
  size_estimate: string;
  available: boolean;
  preview: any;
}

export interface ClonePreviewResponse {
  agent_id: string;
  agent_name: string;
  sections: SectionPreview[];
}

export interface CloneAgentWizardRequest {
  new_name: string;
  sections: string[];
  overrides?: Record<string, any>;
}

export interface CloneAgentWizardResponse {
  agent_id: string;
  name: string;
  source_agent_id: string;
  cloned_sections: string[];
  created_at: string | null;
}

export interface CloneHistoryWizardItem {
  id: string;
  source_agent_id: string;
  target_agent_id: string | null;
  source_agent_name: string | null;
  target_agent_name: string | null;
  cloned_sections: string[];
  clone_options: Record<string, any>;
  created_at: string | null;
}

export interface CloneHistoryWizardResponse {
  history: CloneHistoryWizardItem[];
  total: number;
}

export interface CloneSuggestion {
  suggested_name: string;
  suggested_tweaks: string[];
}

// ============================================================================
// API Functions
// ============================================================================

export const getClonePreview = async (agentId: string): Promise<ClonePreviewResponse> => {
  const response = await backendApi.post<ClonePreviewResponse>(
    `/agents/${agentId}/clone-preview`,
    {},
    { showErrors: false }
  );

  if (response.error) {
    throw new Error(`Failed to get clone preview: ${response.error.message}`);
  }

  return response.data!;
};

export const cloneAgentWizard = async (
  agentId: string,
  request: CloneAgentWizardRequest
): Promise<CloneAgentWizardResponse> => {
  const response = await backendApi.post<CloneAgentWizardResponse>(
    `/agents/${agentId}/clone`,
    request,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to clone agent: ${response.error.message}`);
  }

  return response.data!;
};

export const getCloneHistory = async (
  limit: number = 50
): Promise<CloneHistoryWizardResponse> => {
  const response = await backendApi.get<CloneHistoryWizardResponse>(
    `/agents/clone-history?limit=${limit}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch clone history: ${response.error.message}`);
  }

  return response.data!;
};

export const getCloneSuggestions = async (agentId: string): Promise<CloneSuggestion> => {
  const response = await backendApi.get<CloneSuggestion>(
    `/agents/${agentId}/clone-suggestions`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to get clone suggestions: ${response.error.message}`);
  }

  return response.data!;
};
