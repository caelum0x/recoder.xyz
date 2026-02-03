import type { PullRequestDetails } from "./types";

type CacheKey = `${string}/${string}/${number}`;

export const prDetailsCache = new Map<number, Promise<PullRequestDetails>>();
export const diffsCache = new Map<CacheKey, Promise<Map<string, string>>>();

export function createCacheKey(
  owner: string,
  repo: string,
  prNumber: number
): CacheKey {
  return `${owner}/${repo}/${prNumber}`;
}

export function clearPRCache(): void {
  prDetailsCache.clear();
}

export function clearDiffsCache(): void {
  diffsCache.clear();
}

export function clearAllCaches(): void {
  clearPRCache();
  clearDiffsCache();
}
