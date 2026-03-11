import { backendApi } from '@/lib/api-client';

export interface MultilangPromptSet {
  id: string;
  user_id: string;
  prompt_name: string;
  base_language: string;
  description: string | null;
  category: string;
  created_at: string;
  updated_at: string;
  variant_count?: number;
  variants?: MultilangPromptVariant[];
}

export interface MultilangPromptVariant {
  id: string;
  prompt_set_id: string;
  user_id: string;
  language_code: string;
  content: string;
  is_machine_translated: boolean;
  quality_score: number | null;
  created_at: string;
  updated_at: string;
  is_fallback?: boolean;
  fallback_language?: string;
  requested_language?: string;
}

export interface CreatePromptSetData {
  prompt_name: string;
  base_language?: string;
  description?: string;
  category?: string;
}

export interface CreateVariantData {
  language_code: string;
  content: string;
  is_machine_translated?: boolean;
}

export interface LanguageDistributionEntry {
  language_code: string;
  count: number;
}

export interface CoveragePerSet {
  id: string;
  prompt_name: string;
  category: string;
  base_language: string;
  variant_count: number;
  languages: string[] | null;
}

export interface SetNeedingTranslation {
  id: string;
  prompt_name: string;
  missing_languages: string[];
}

export interface MultilangStatsSummary {
  total_sets: number;
  fully_covered_sets: number;
  common_languages: string[];
}

export interface MultilangStats {
  language_distribution: LanguageDistributionEntry[];
  coverage_per_set: CoveragePerSet[];
  sets_needing_translation: SetNeedingTranslation[];
  summary: MultilangStatsSummary;
}

export const createPromptSet = async (
  data: CreatePromptSetData
): Promise<MultilangPromptSet> => {
  const response = await backendApi.post<MultilangPromptSet>(
    '/prompts/multilang',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listPromptSets = async (filters?: {
  category?: string;
  search?: string;
  limit?: number;
}): Promise<MultilangPromptSet[]> => {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const response = await backendApi.get<MultilangPromptSet[]>(
    `/prompts/multilang${qs ? `?${qs}` : ''}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPromptSet = async (
  promptSetId: string
): Promise<MultilangPromptSet> => {
  const response = await backendApi.get<MultilangPromptSet>(
    `/prompts/multilang/${promptSetId}`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deletePromptSet = async (promptSetId: string): Promise<void> => {
  const response = await backendApi.delete(
    `/prompts/multilang/${promptSetId}`
  );
  if (response.error) throw new Error(response.error.message);
};

export const upsertVariant = async (
  promptSetId: string,
  data: CreateVariantData
): Promise<MultilangPromptVariant> => {
  const response = await backendApi.post<MultilangPromptVariant>(
    `/prompts/multilang/${promptSetId}/variants`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listVariants = async (
  promptSetId: string
): Promise<MultilangPromptVariant[]> => {
  const response = await backendApi.get<MultilangPromptVariant[]>(
    `/prompts/multilang/${promptSetId}/variants`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteVariant = async (
  promptSetId: string,
  languageCode: string
): Promise<void> => {
  const response = await backendApi.delete(
    `/prompts/multilang/${promptSetId}/variants/${languageCode}`
  );
  if (response.error) throw new Error(response.error.message);
};

export const getVariant = async (
  promptSetId: string,
  languageCode: string
): Promise<MultilangPromptVariant> => {
  const response = await backendApi.get<MultilangPromptVariant>(
    `/prompts/multilang/${promptSetId}/variant/${languageCode}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getMultilangStats = async (): Promise<MultilangStats> => {
  const response = await backendApi.get<MultilangStats>(
    '/prompts/multilang/stats',
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
