import { requireSessionAccessToken } from '@/lib/auth/session-token';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export interface ExportRequest {
  content: string;
  fileName: string;
}

/**
 * Export content as PDF. Returns a Blob.
 */
export async function exportToPdf(request: ExportRequest): Promise<Blob> {
  const token = await requireSessionAccessToken();

  const response = await fetch(`${API_URL}/export/pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Export failed' }));
    throw new Error(error.detail || `Export failed: ${response.status}`);
  }

  return response.blob();
}

/**
 * Export content as DOCX. Returns a Blob.
 */
export async function exportToDocx(request: ExportRequest): Promise<Blob> {
  const token = await requireSessionAccessToken();

  const response = await fetch(`${API_URL}/export/docx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Export failed' }));
    throw new Error(error.detail || `Export failed: ${response.status}`);
  }

  return response.blob();
}
