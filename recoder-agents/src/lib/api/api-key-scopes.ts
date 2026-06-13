import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeyScopesResponse {
  key_id: string;
  scopes: string[];
}

export interface KeyRestrictionsResponse {
  id?: string;
  key_id: string;
  user_id?: string;
  allowed_ips: string[];
  allowed_agents: string[];
  rate_limit_override: number | null;
  expires_at: string | null;
  created_at?: string;
}

export interface SetKeyRestrictionsData {
  allowed_ips?: string[];
  allowed_agents?: string[];
  rate_limit_override?: number | null;
  expires_at?: string | null;
}

export interface ValidateScopeResponse {
  key_id: string;
  scope: string;
  has_scope: boolean;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getKeyScopes = async (
  keyId: string
): Promise<KeyScopesResponse> => {
  const response = await backendApi.get<KeyScopesResponse>(
    `/keys/${keyId}/scopes`,
    { showErrors: true, cache: 'no-store' }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const setKeyScopes = async (
  keyId: string,
  scopes: string[]
): Promise<KeyScopesResponse> => {
  const response = await backendApi.put<KeyScopesResponse>(
    `/keys/${keyId}/scopes`,
    { scopes }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getKeyRestrictions = async (
  keyId: string
): Promise<KeyRestrictionsResponse> => {
  const response = await backendApi.get<KeyRestrictionsResponse>(
    `/keys/${keyId}/restrictions`,
    { showErrors: true, cache: 'no-store' }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const setKeyRestrictions = async (
  keyId: string,
  data: SetKeyRestrictionsData
): Promise<KeyRestrictionsResponse> => {
  const response = await backendApi.put<KeyRestrictionsResponse>(
    `/keys/${keyId}/restrictions`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const validateKeyScope = async (
  keyId: string,
  scope: string
): Promise<ValidateScopeResponse> => {
  const response = await backendApi.post<ValidateScopeResponse>(
    `/keys/${keyId}/validate-scope`,
    { scope }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
