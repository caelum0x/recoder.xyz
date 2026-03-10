import { requireSessionAccessToken } from '@/lib/auth/session-token';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EcosystemTag {
  id: string;
  name: string;
  slug: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  items?: EcosystemTagItem[];
}

export interface EcosystemTagItem {
  id: string;
  tagId: string;
  sourceApp: string;
  externalId: string;
  label: string;
  itemType: string;
  itemUrl: string;
  createdAt: string;
}

export interface CreateTagPayload {
  name: string;
  color?: string;
}

export interface UpdateTagPayload {
  name?: string;
  color?: string;
}

export interface LinkItemPayload {
  sourceApp: string;
  externalId: string;
  label: string;
  itemType: string;
  itemUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = `${process.env.NEXT_PUBLIC_URL || 'https://recoder.xyz'}/api/platform/tags`;

async function platformFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await requireSessionAccessToken();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'Unknown error');
    throw new Error(body || `Request failed with status ${res.status}`);
  }

  // Handle 204 No Content (e.g. DELETE)
  if (res.status === 204) {
    return undefined!;
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Tag CRUD
// ---------------------------------------------------------------------------

/** Fetch all tags for the current user. */
export async function getTags(): Promise<EcosystemTag[]> {
  return platformFetch<EcosystemTag[]>('');
}

/** Create a new tag. */
export async function createTag(payload: CreateTagPayload): Promise<EcosystemTag> {
  return platformFetch<EcosystemTag>('', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Update an existing tag. */
export async function updateTag(
  tagId: string,
  payload: UpdateTagPayload,
): Promise<EcosystemTag> {
  return platformFetch<EcosystemTag>(`/${tagId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Delete a tag. */
export async function deleteTag(tagId: string): Promise<void> {
  return platformFetch<void>(`/${tagId}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Tag Item linking
// ---------------------------------------------------------------------------

/** Get all items linked to a tag. */
export async function getTagItems(tagId: string): Promise<EcosystemTagItem[]> {
  return platformFetch<EcosystemTagItem[]>(`/${tagId}/items`);
}

/** Link an external item (thread, project, etc.) to a tag. */
export async function linkItem(
  tagId: string,
  payload: LinkItemPayload,
): Promise<EcosystemTagItem> {
  return platformFetch<EcosystemTagItem>(`/${tagId}/items`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Unlink an item from a tag. */
export async function unlinkItem(
  tagId: string,
  itemId: string,
): Promise<void> {
  return platformFetch<void>(`/${tagId}/items/${itemId}`, {
    method: 'DELETE',
  });
}
