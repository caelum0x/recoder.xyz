import { backendApi } from '../api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReactionGroup {
  emoji: string;
  count: number;
  user_ids: string[];
  includes_me: boolean;
}

export interface FrequentEmoji {
  emoji: string;
  count: number;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export const addReaction = async (
  threadId: string,
  messageIndex: number,
  emoji: string
): Promise<{ success: boolean; already_exists?: boolean }> => {
  const response = await backendApi.post<{ success: boolean; already_exists?: boolean }>(
    `/threads/${threadId}/messages/${messageIndex}/reactions`,
    { emoji }
  );
  if (response.error) {
    throw new Error(`Failed to add reaction: ${response.error.message}`);
  }
  return response.data!;
};

export const removeReaction = async (
  threadId: string,
  messageIndex: number,
  emoji: string
): Promise<void> => {
  const response = await backendApi.delete(
    `/threads/${threadId}/messages/${messageIndex}/reactions/${encodeURIComponent(emoji)}`
  );
  if (response.error) {
    throw new Error(`Failed to remove reaction: ${response.error.message}`);
  }
};

export const getMessageReactions = async (
  threadId: string,
  messageIndex: number
): Promise<ReactionGroup[]> => {
  const response = await backendApi.get<{ reactions: ReactionGroup[] }>(
    `/threads/${threadId}/messages/${messageIndex}/reactions`,
    { showErrors: false }
  );
  if (response.error) {
    throw new Error(`Failed to get reactions: ${response.error.message}`);
  }
  return response.data!.reactions;
};

export const getThreadReactions = async (
  threadId: string
): Promise<Record<number, ReactionGroup[]>> => {
  const response = await backendApi.get<{ reactions_by_message: Record<number, ReactionGroup[]> }>(
    `/threads/${threadId}/reactions`,
    { showErrors: false }
  );
  if (response.error) {
    throw new Error(`Failed to get thread reactions: ${response.error.message}`);
  }
  return response.data!.reactions_by_message;
};

export const getFrequentEmojis = async (
  limit: number = 10
): Promise<FrequentEmoji[]> => {
  const response = await backendApi.get<{ emojis: FrequentEmoji[] }>(
    `/reactions/frequent?limit=${limit}`,
    { showErrors: false }
  );
  if (response.error) {
    throw new Error(`Failed to get frequent emojis: ${response.error.message}`);
  }
  return response.data!.emojis;
};
