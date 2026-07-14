// Owned by Recoder. The raw gateway imported `../../media/store.js` to persist
// downloaded media to a stable on-disk path the agent loop can reference. That
// media sibling was not part of the extraction. The Discord adapter calls
// `saveMediaBuffer(buffer, contentType, kind, maxBytes)` and consumes the
// returned `{ path, contentType }`. Reconstructed here as its real,
// dependency-free behavior: a size-guarded, content-addressed write under the
// connectors media directory.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConnectorEnv } from "../../src/identity.js";

export type MediaKind = "inbound" | "outbound";

export interface SavedMedia {
  /** Absolute path the bytes were written to. */
  path: string;
  /** Content-type the media was saved with, if known. */
  contentType?: string;
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "application/pdf": "pdf",
};

function resolveMediaRoot(): string {
  const configured = readConnectorEnv("MEDIA_DIR");
  return configured?.trim() || join(tmpdir(), "recoder-connectors", "media");
}

function resolveExtension(contentType?: string): string {
  if (!contentType) {
    return "bin";
  }
  return EXTENSION_BY_TYPE[contentType.toLowerCase()] ?? "bin";
}

/**
 * Persist `buffer` under the connectors media directory and return its absolute
 * path. The filename is content-addressed (sha-256 of the bytes) so identical
 * media is de-duplicated. Throws when the payload exceeds `maxBytes`, so callers
 * enforce per-channel media limits before the agent ever sees the file.
 */
export async function saveMediaBuffer(
  buffer: Buffer | Uint8Array,
  contentType: string | undefined,
  kind: MediaKind,
  maxBytes: number,
): Promise<SavedMedia> {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (Number.isFinite(maxBytes) && maxBytes > 0 && bytes.byteLength > maxBytes) {
    throw new Error(`media exceeds max size (${bytes.byteLength} > ${maxBytes} bytes)`);
  }
  const root = join(resolveMediaRoot(), kind);
  mkdirSync(root, { recursive: true });
  const digest = createHash("sha256").update(bytes).digest("hex");
  const extension = resolveExtension(contentType);
  const path = join(root, `${digest}.${extension}`);
  writeFileSync(path, bytes);
  return { path, contentType };
}
