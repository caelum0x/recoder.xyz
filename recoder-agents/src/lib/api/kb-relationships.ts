import { requireSessionAccessToken } from '@/lib/auth/session-token';
import { resolveBrowserBackendApiUrl } from '@/lib/runtime-urls';

const API_URL = resolveBrowserBackendApiUrl();

const getHeaders = async () => {
  const accessToken = await requireSessionAccessToken();
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` };
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface KbRelationship {
  id: string;
  user_id: string;
  source_entry_id: string;
  target_entry_id: string;
  relationship_type: string;
  strength: number;
  auto_detected: boolean;
  created_at: string;
}

export interface KbGraphNode {
  id: string;
  title: string;
  content_type: string | null;
  file_type: string | null;
  created_at: string | null;
}

export interface KbGraphEdge {
  id: string;
  source: string;
  target: string;
  relationship_type: string;
  strength: number;
  auto_detected: boolean;
}

export interface KbGraph {
  nodes: KbGraphNode[];
  edges: KbGraphEdge[];
}

export interface KbRelationshipSuggestion {
  source_id: string;
  target_id: string;
  target_title: string;
  reason: string;
  confidence: number;
}

export interface CreateRelationshipPayload {
  source_entry_id: string;
  target_entry_id: string;
  relationship_type?: string;
  strength?: number;
}

// ── API Functions ────────────────────────────────────────────────────────────

export const createKbRelationship = async (
  payload: CreateRelationshipPayload
): Promise<KbRelationship> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/kb/relationships`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to create relationship');
  }
  return response.json();
};

export const listKbRelationships = async (filters?: {
  entry_id?: string;
  relationship_type?: string;
}): Promise<KbRelationship[]> => {
  const headers = await getHeaders();
  const params = new URLSearchParams();
  if (filters?.entry_id) params.set('entry_id', filters.entry_id);
  if (filters?.relationship_type) params.set('relationship_type', filters.relationship_type);

  const qs = params.toString();
  const url = `${API_URL}/kb/relationships${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch KB relationships');
  }
  return response.json();
};

export const deleteKbRelationship = async (relationshipId: string): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/kb/relationships/${relationshipId}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to delete relationship');
  }
};

export const getKbGraph = async (): Promise<KbGraph> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/kb/graph`, { headers });
  if (!response.ok) {
    throw new Error('Failed to fetch KB graph');
  }
  return response.json();
};

export const getRelationshipSuggestions = async (
  entryId: string,
  limit: number = 5
): Promise<KbRelationshipSuggestion[]> => {
  const headers = await getHeaders();
  const response = await fetch(
    `${API_URL}/kb/relationships/suggestions?entry_id=${entryId}&limit=${limit}`,
    { headers }
  );
  if (!response.ok) {
    throw new Error('Failed to fetch relationship suggestions');
  }
  return response.json();
};
