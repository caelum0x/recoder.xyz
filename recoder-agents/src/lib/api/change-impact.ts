import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export type ChangeType =
  | 'config_update'
  | 'tool_change'
  | 'prompt_change'
  | 'model_change'
  | 'workflow_change'
  | 'dependency_change';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type AnalysisStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export interface AffectedItem {
  type: string;
  id: string;
  name: string;
  impact: string;
  environment?: string;
}

export interface ImpactAnalysis {
  id: string;
  user_id: string;
  agent_id: string;
  change_type: ChangeType;
  change_description: string;
  proposed_changes: Record<string, unknown>;
  impact_assessment: {
    total_affected: number;
    affected_by_type: Record<string, number>;
    summary: string;
  };
  risk_level: RiskLevel;
  affected_items: AffectedItem[];
  status: AnalysisStatus;
  created_at: string;
}

export interface RunImpactAnalysisRequest {
  change_type: ChangeType;
  change_description: string;
  proposed_changes?: Record<string, unknown>;
}

export interface UpdateImpactStatusRequest {
  status: 'approved' | 'rejected';
}

export interface ImpactStats {
  total: number;
  by_risk_level: Record<string, number>;
  by_change_type: Record<string, number>;
  approval_rate: number;
}

// ============================================================================
// API Functions
// ============================================================================

export async function runImpactAnalysis(
  agentId: string,
  body: RunImpactAnalysisRequest,
): Promise<ImpactAnalysis> {
  try {
    const response = await backendApi.post<ImpactAnalysis>(
      `/agents/${agentId}/impact-analysis`,
      body,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'run impact analysis', resource: 'change-impact' });
    throw error;
  }
}

export async function getAgentImpactAnalyses(
  agentId: string,
): Promise<ImpactAnalysis[]> {
  try {
    const response = await backendApi.get<ImpactAnalysis[]>(
      `/agents/${agentId}/impact-analyses`,
      { showErrors: true, cache: 'no-store' },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list impact analyses', resource: 'change-impact' });
    throw error;
  }
}

export async function getImpactAnalysisDetail(
  analysisId: string,
): Promise<ImpactAnalysis> {
  try {
    const response = await backendApi.get<ImpactAnalysis>(
      `/impact-analyses/${analysisId}`,
      { showErrors: true, cache: 'no-store' },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get impact analysis', resource: 'change-impact' });
    throw error;
  }
}

export async function updateImpactStatus(
  analysisId: string,
  body: UpdateImpactStatusRequest,
): Promise<ImpactAnalysis> {
  try {
    const response = await backendApi.patch<ImpactAnalysis>(
      `/impact-analyses/${analysisId}`,
      body,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'update impact status', resource: 'change-impact' });
    throw error;
  }
}

export async function getImpactStats(): Promise<ImpactStats> {
  try {
    const response = await backendApi.get<ImpactStats>(
      '/impact-analyses/stats',
      { showErrors: true, cache: 'no-store' },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get impact stats', resource: 'change-impact' });
    throw error;
  }
}
