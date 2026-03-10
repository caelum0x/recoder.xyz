import { backendApi } from '@/lib/api-client';
import { handleApiError } from '@/lib/error-handler';

// ---------- Types ----------

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  user_id: string;
  title: string;
  description: string | null;
  action_url: string | null;
  sort_order: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string | null;
}

export interface Checklist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  checklist_type: string;
  is_template: boolean;
  created_at: string | null;
  items?: ChecklistItem[];
  completed_count?: number;
  total_count?: number;
}

export interface ChecklistsListResponse {
  checklists: Checklist[];
}

export interface CreateChecklistItemData {
  title: string;
  description?: string;
  action_url?: string;
  sort_order?: number;
}

export interface CreateChecklistData {
  name: string;
  description?: string;
  checklist_type?: string;
  is_template?: boolean;
  items?: CreateChecklistItemData[];
}

export interface UpdateChecklistItemData {
  title?: string;
  description?: string;
  action_url?: string;
  is_completed?: boolean;
}

// ---------- API Functions ----------

export async function listChecklists(checklistType?: string): Promise<ChecklistsListResponse> {
  const params = new URLSearchParams();
  if (checklistType) params.set('checklist_type', checklistType);
  const query = params.toString() ? `?${params.toString()}` : '';

  const response = await backendApi.get<ChecklistsListResponse>(
    `/onboarding/checklists${query}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'list checklists' });
    throw new Error(response.error.message || 'Failed to list checklists');
  }

  return response.data!;
}

export async function getChecklist(checklistId: string): Promise<Checklist> {
  const response = await backendApi.get<Checklist>(
    `/onboarding/checklists/${checklistId}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'get checklist' });
    throw new Error(response.error.message || 'Failed to get checklist');
  }

  return response.data!;
}

export async function createChecklist(data: CreateChecklistData): Promise<Checklist> {
  const response = await backendApi.post<Checklist>(
    '/onboarding/checklists',
    data,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'create checklist' });
    throw new Error(response.error.message || 'Failed to create checklist');
  }

  return response.data!;
}

export async function deleteChecklist(checklistId: string): Promise<void> {
  const response = await backendApi.delete(
    `/onboarding/checklists/${checklistId}`,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'delete checklist' });
    throw new Error(response.error.message || 'Failed to delete checklist');
  }
}

export async function addChecklistItem(
  checklistId: string,
  data: CreateChecklistItemData
): Promise<ChecklistItem> {
  const response = await backendApi.post<ChecklistItem>(
    `/onboarding/checklists/${checklistId}/items`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'add checklist item' });
    throw new Error(response.error.message || 'Failed to add checklist item');
  }

  return response.data!;
}

export async function updateChecklistItem(
  checklistId: string,
  itemId: string,
  data: UpdateChecklistItemData
): Promise<ChecklistItem> {
  const response = await backendApi.patch<ChecklistItem>(
    `/onboarding/checklists/${checklistId}/items/${itemId}`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'update checklist item' });
    throw new Error(response.error.message || 'Failed to update checklist item');
  }

  return response.data!;
}

export async function deleteChecklistItem(
  checklistId: string,
  itemId: string
): Promise<void> {
  const response = await backendApi.delete(
    `/onboarding/checklists/${checklistId}/items/${itemId}`,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'delete checklist item' });
    throw new Error(response.error.message || 'Failed to delete checklist item');
  }
}

export async function seedDefaultChecklist(): Promise<Checklist> {
  const response = await backendApi.post<Checklist>(
    '/onboarding/checklists/seed',
    {},
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'seed default checklist' });
    throw new Error(response.error.message || 'Failed to seed default checklist');
  }

  return response.data!;
}
