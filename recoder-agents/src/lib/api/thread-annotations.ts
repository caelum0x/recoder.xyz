import { backendApi } from '@/lib/api-client';

export type AnnotationType = 'note' | 'highlight' | 'question' | 'action' | 'bug' | 'insight' | 'action_item' | 'warning';

export interface ThreadAnnotation {
  id: string;
  user_id: string;
  thread_id: string;
  message_index: number | null;
  annotation_type: AnnotationType;
  content: string;
  color: string;
  is_resolved: boolean;
  resolved_at: string | null;
  reply_count?: number;
  created_at: string;
  updated_at: string;
}

export interface AnnotationReply {
  id: string;
  annotation_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface CreateAnnotationData {
  message_index?: number;
  annotation_type?: AnnotationType;
  content: string;
  color?: string;
}

export interface UpdateAnnotationData {
  content?: string;
  annotation_type?: AnnotationType;
  color?: string;
  is_resolved?: boolean;
  message_index?: number;
}

export interface AnnotationFilters {
  annotation_type?: AnnotationType;
  resolved?: boolean;
}

export interface AnnotationSummary {
  total: number;
  unresolved: number;
  by_type: Record<string, number>;
}

export const listAnnotations = async (
  threadId: string,
  filters?: AnnotationFilters
): Promise<ThreadAnnotation[]> => {
  const params = new URLSearchParams();
  if (filters?.annotation_type) params.set('annotation_type', filters.annotation_type);
  if (filters?.resolved !== undefined) params.set('resolved', String(filters.resolved));
  const qs = params.toString();
  const response = await backendApi.get<ThreadAnnotation[]>(
    `/threads/${threadId}/annotations${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createAnnotation = async (
  threadId: string,
  data: CreateAnnotationData
): Promise<ThreadAnnotation> => {
  const response = await backendApi.post<ThreadAnnotation>(
    `/threads/${threadId}/annotations`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateAnnotation = async (
  threadId: string,
  annotationId: string,
  data: UpdateAnnotationData
): Promise<ThreadAnnotation> => {
  const response = await backendApi.patch<ThreadAnnotation>(
    `/threads/${threadId}/annotations/${annotationId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteAnnotation = async (
  threadId: string,
  annotationId: string
): Promise<void> => {
  const response = await backendApi.delete(
    `/threads/${threadId}/annotations/${annotationId}`
  );
  if (response.error) throw new Error(response.error.message);
};

export const getRecentAnnotations = async (
  limit: number = 10
): Promise<ThreadAnnotation[]> => {
  const response = await backendApi.get<ThreadAnnotation[]>(
    `/annotations/recent?limit=${limit}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAnnotationSummary = async (): Promise<AnnotationSummary> => {
  const response = await backendApi.get<AnnotationSummary>(
    '/annotations/summary',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
