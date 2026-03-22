import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BranchStatus = 'active' | 'merged' | 'archived' | 'deleted';

export interface ThreadBranch {
  id: string;
  user_id: string;
  source_thread_id: string;
  branch_thread_id: string;
  branch_point_index: number;
  branch_name: string | null;
  description: string | null;
  status: BranchStatus;
  created_at: string;
}

export interface BranchListResponse {
  branches: ThreadBranch[];
}

export interface CreateBranchRequest {
  branch_point_index: number;
  branch_name?: string;
  description?: string;
}

export interface UpdateBranchRequest {
  branch_name?: string;
  description?: string;
  status?: BranchStatus;
}

export interface BranchTreeNode {
  thread_id: string;
  branch?: ThreadBranch;
  children: BranchTreeNode[];
}

export interface BranchTreeResponse {
  tree: BranchTreeNode;
  total_branches: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const createBranch = async (
  threadId: string,
  data: CreateBranchRequest,
): Promise<ThreadBranch> => {
  const response = await backendApi.post<ThreadBranch>(
    `/threads/${threadId}/branch`,
    data,
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to create branch: ${response.error.message}`);
  }
  return response.data!;
};

export const getThreadBranches = async (
  threadId: string,
): Promise<BranchListResponse> => {
  const response = await backendApi.get<BranchListResponse>(
    `/threads/${threadId}/branches`,
    { showErrors: true, cache: 'no-store' },
  );
  if (response.error) {
    throw new Error(`Failed to fetch branches: ${response.error.message}`);
  }
  return response.data!;
};

export const getBranchDetail = async (
  branchId: string,
): Promise<ThreadBranch> => {
  const response = await backendApi.get<ThreadBranch>(
    `/branches/${branchId}`,
    { showErrors: true, cache: 'no-store' },
  );
  if (response.error) {
    throw new Error(`Failed to fetch branch: ${response.error.message}`);
  }
  return response.data!;
};

export const updateBranch = async (
  branchId: string,
  data: UpdateBranchRequest,
): Promise<ThreadBranch> => {
  const response = await backendApi.patch<ThreadBranch>(
    `/branches/${branchId}`,
    data,
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to update branch: ${response.error.message}`);
  }
  return response.data!;
};

export const deleteBranch = async (
  branchId: string,
): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete<{ deleted: boolean }>(
    `/branches/${branchId}`,
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to delete branch: ${response.error.message}`);
  }
  return response.data!;
};

export const getBranchTree = async (
  threadId: string,
): Promise<BranchTreeResponse> => {
  const response = await backendApi.get<BranchTreeResponse>(
    `/branches/tree/${threadId}`,
    { showErrors: true, cache: 'no-store' },
  );
  if (response.error) {
    throw new Error(`Failed to fetch branch tree: ${response.error.message}`);
  }
  return response.data!;
};
