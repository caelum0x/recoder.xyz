// Owned by Recoder. The raw gateway imported `../../media/fetch.js` to download
// inbound attachment bytes before persisting them. That media sibling was not
// part of the extraction. The Discord adapter calls
// `fetchRemoteMedia({ url, filePathHint })` and consumes the returned
// `{ buffer, contentType }`. Reconstructed here as its real, dependency-free
// behavior over the resolved global `fetch`.

import { resolveFetch } from "../infra/fetch.js";

export interface FetchRemoteMediaParams {
  /** Absolute URL of the remote media to download. */
  url: string;
  /**
   * Original filename / URL hint, used to recover a content-type when the server
   * does not send one. Informational only.
   */
  filePathHint?: string;
  /** Optional fetch override (tests / injection). */
  fetcher?: typeof fetch;
}

export interface FetchedRemoteMedia {
  /** Downloaded bytes. */
  buffer: Buffer;
  /** Content-type reported by the server (`Content-Type` header), if any. */
  contentType?: string;
}

/**
 * Download `params.url` and return its bytes plus the server-reported
 * content-type. Throws when no fetch implementation is available or when the
 * server responds non-2xx, so callers can log + skip the attachment.
 */
export async function fetchRemoteMedia(
  params: FetchRemoteMediaParams,
): Promise<FetchedRemoteMedia> {
  const fetchImpl = resolveFetch(params.fetcher);
  if (!fetchImpl) {
    throw new Error("no fetch implementation available to download media");
  }
  const res = await fetchImpl(params.url);
  if (!res.ok) {
    throw new Error(`media download failed (${res.status}) for ${params.url}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const headerContentType = res.headers.get("content-type") ?? undefined;
  const contentType = headerContentType?.split(";")[0]?.trim() || undefined;
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}
