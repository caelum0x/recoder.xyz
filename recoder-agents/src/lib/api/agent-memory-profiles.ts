import { backendApi } from '@/lib/api-client';

export type ValueType = 'text' | 'number' | 'json' | 'list';

export interface MemoryProfile {
  id: string;
  user_id: string;
  agent_id: string;
  profile_name: string;
  is_active: boolean;
  slot_count?: number;
  created_at: string;
  updated_at: string;
  slots?: MemorySlot[];
}

export interface MemorySlot {
  id: string;
  profile_id: string;
  user_id: string;
  slot_key: string;
  slot_value: string;
  value_type: ValueType;
  description: string | null;
  is_persistent: boolean;
  last_updated_at: string;
  access_count: number;
}

export interface MemoryAccessLog {
  id: string;
  slot_id: string;
  user_id: string;
  access_type: 'read' | 'write' | 'delete';
  old_value: string | null;
  new_value: string | null;
  accessed_at: string;
  slot_key?: string;
}

export interface CreateProfileData {
  profile_name: string;
  is_active?: boolean;
}

export interface UpdateProfileData {
  profile_name?: string;
  is_active?: boolean;
}

export interface SetSlotData {
  slot_key: string;
  slot_value: string;
  value_type?: ValueType;
  description?: string;
  is_persistent?: boolean;
}

export const listMemoryProfiles = async (agentId: string): Promise<MemoryProfile[]> => {
  const response = await backendApi.get<MemoryProfile[]>(
    `/agents/${agentId}/memory-profiles`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createMemoryProfile = async (
  agentId: string,
  data: CreateProfileData
): Promise<MemoryProfile> => {
  const response = await backendApi.post<MemoryProfile>(
    `/agents/${agentId}/memory-profiles`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getMemoryProfile = async (
  agentId: string,
  profileId: string
): Promise<MemoryProfile> => {
  const response = await backendApi.get<MemoryProfile>(
    `/agents/${agentId}/memory-profiles/${profileId}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateMemoryProfile = async (
  agentId: string,
  profileId: string,
  data: UpdateProfileData
): Promise<MemoryProfile> => {
  const response = await backendApi.patch<MemoryProfile>(
    `/agents/${agentId}/memory-profiles/${profileId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteMemoryProfile = async (
  agentId: string,
  profileId: string
): Promise<void> => {
  const response = await backendApi.delete(
    `/agents/${agentId}/memory-profiles/${profileId}`
  );
  if (response.error) throw new Error(response.error.message);
};

export const setMemorySlot = async (
  profileId: string,
  data: SetSlotData
): Promise<MemorySlot> => {
  const response = await backendApi.post<MemorySlot>(
    `/memory-profiles/${profileId}/slots`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listMemorySlots = async (profileId: string): Promise<MemorySlot[]> => {
  const response = await backendApi.get<MemorySlot[]>(
    `/memory-profiles/${profileId}/slots`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getMemorySlot = async (
  profileId: string,
  slotKey: string
): Promise<MemorySlot> => {
  const response = await backendApi.get<MemorySlot>(
    `/memory-profiles/${profileId}/slots/${slotKey}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteMemorySlot = async (
  profileId: string,
  slotKey: string
): Promise<void> => {
  const response = await backendApi.delete(
    `/memory-profiles/${profileId}/slots/${slotKey}`
  );
  if (response.error) throw new Error(response.error.message);
};

export const getMemoryAccessLog = async (
  profileId: string,
  limit: number = 50
): Promise<MemoryAccessLog[]> => {
  const response = await backendApi.get<MemoryAccessLog[]>(
    `/memory-profiles/${profileId}/access-log?limit=${limit}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
