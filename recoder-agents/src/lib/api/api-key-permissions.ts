import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKeyPermissions {
  id?: string;
  key_id: string;
  user_id?: string;
  has_custom_permissions: boolean;
  allowed_endpoints: string[];
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  ip_whitelist: string[];
  expires_at: string | null;
  created_at?: string;
}

export interface UpdateApiKeyPermissionsData {
  allowed_endpoints: string[];
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  ip_whitelist: string[];
  expires_at: string | null;
}

export interface TestApiKeyResult {
  key_id: string;
  status: 'active' | 'expired' | 'not_found';
  has_custom_permissions: boolean;
  allowed_endpoints: string[];
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  ip_whitelist: string[];
  expires_at: string | null;
  is_expired: boolean;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getApiKeyPermissions = async (
  keyId: string
): Promise<ApiKeyPermissions> => {
  const response = await backendApi.get<ApiKeyPermissions>(
    `/api-keys/${keyId}/permissions`,
    { showErrors: true, cache: 'no-store' }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateApiKeyPermissions = async (
  keyId: string,
  data: UpdateApiKeyPermissionsData
): Promise<ApiKeyPermissions> => {
  const response = await backendApi.put<ApiKeyPermissions>(
    `/api-keys/${keyId}/permissions`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteApiKeyPermissions = async (
  keyId: string
): Promise<{ message: string }> => {
  const response = await backendApi.delete<{ message: string }>(
    `/api-keys/${keyId}/permissions`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const testApiKey = async (
  keyId: string
): Promise<TestApiKeyResult> => {
  const response = await backendApi.post<TestApiKeyResult>(
    `/api-keys/${keyId}/test`,
    {}
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
