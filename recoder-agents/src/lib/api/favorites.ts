import { backendApi } from '@/lib/api-client';

export interface Favorite {
  id: string;
  user_id: string;
  item_type: 'agent' | 'thread' | 'workflow' | 'knowledge_entry';
  item_id: string;
  item_name: string | null;
  created_at: string;
}

export const addFavorite = async (itemType: string, itemId: string, itemName?: string) => {
  const response = await backendApi.post('/favorites', {
    item_type: itemType,
    item_id: itemId,
    item_name: itemName || null,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const removeFavorite = async (itemType: string, itemId: string) => {
  const response = await backendApi.delete(`/favorites/${itemType}/${itemId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const getFavorites = async (type?: string): Promise<Favorite[]> => {
  const url = type ? `/favorites?type=${type}` : '/favorites';
  const response = await backendApi.get<Favorite[]>(url, { showErrors: false });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const checkFavorite = async (itemType: string, itemId: string): Promise<boolean> => {
  const response = await backendApi.get<{ is_favorited: boolean }>(
    `/favorites/check/${itemType}/${itemId}`,
    { showErrors: false }
  );
  if (response.error) return false;
  return response.data?.is_favorited ?? false;
};
