import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface DigestConfig {
  id: string;
  user_id: string;
  frequency: 'off' | 'hourly' | 'daily' | 'weekly';
  include_types: string[];
  delivery_hour: number;
  delivery_day: number;
  created_at: string;
  updated_at: string;
}

export interface DigestConfigUpdate {
  frequency?: 'off' | 'hourly' | 'daily' | 'weekly';
  include_types?: string[];
  delivery_hour?: number;
  delivery_day?: number;
}

export interface DigestSummary {
  id: string;
  user_id: string;
  digest_type: string;
  notification_count: number;
  content: Record<string, any>;
  period_start: string;
  period_end: string;
  sent_at?: string | null;
  created_at: string;
}

export interface DigestPreview {
  digest_type: string;
  notification_count: number;
  content: Record<string, any>;
  period_start: string;
  period_end: string;
  groups: Record<string, number>;
}

export interface DigestHistoryResponse {
  digests: DigestSummary[];
  total: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const notificationDigestApi = {
  async getConfig(): Promise<DigestConfig> {
    const response = await backendApi.get<DigestConfig>('/notifications/digest/config');
    if (response.error) throw response.error;
    return response.data!;
  },

  async setConfig(update: DigestConfigUpdate): Promise<DigestConfig> {
    const response = await backendApi.put<DigestConfig>(
      '/notifications/digest/config',
      update
    );
    if (response.error) throw response.error;
    return response.data!;
  },

  async generateDigest(): Promise<DigestSummary> {
    const response = await backendApi.post<DigestSummary>(
      '/notifications/digest/generate'
    );
    if (response.error) throw response.error;
    return response.data!;
  },

  async getHistory(limit: number = 20, offset: number = 0): Promise<DigestHistoryResponse> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    const response = await backendApi.get<DigestHistoryResponse>(
      `/notifications/digest/history?${params}`
    );
    if (response.error) throw response.error;
    return response.data ?? { digests: [], total: 0 };
  },

  async getDetail(digestId: string): Promise<DigestSummary> {
    const response = await backendApi.get<DigestSummary>(
      `/notifications/digest/${digestId}`
    );
    if (response.error) throw response.error;
    return response.data!;
  },

  async previewDigest(): Promise<DigestPreview> {
    const response = await backendApi.post<DigestPreview>(
      '/notifications/digest/preview'
    );
    if (response.error) throw response.error;
    return response.data!;
  },
};
