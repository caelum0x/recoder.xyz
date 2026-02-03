/**
 * Hash Utilities
 * Provides content hashing for caching and deduplication
 */

/**
 * Creates a SHA-256 hash of content (browser-compatible)
 * @param content The content to hash
 * @returns Promise resolving to hex hash string
 */
export async function createHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback for environments without crypto.subtle
  return simpleHash(content);
}

/**
 * Creates a hash synchronously (simpler algorithm for non-critical use)
 * @param content The content to hash
 * @returns Hash string
 */
export function createHashSync(content: string): string {
  return simpleHash(content);
}

/**
 * Simple hash function (FNV-1a variant)
 * @param str String to hash
 * @returns Hash string
 */
function simpleHash(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Convert to unsigned 32-bit and then to hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Creates a deterministic UUID v5-like ID from a name and namespace
 * @param name The name to hash
 * @param namespace The namespace UUID
 * @returns UUID-formatted string
 */
export function createUUID(name: string, namespace: string): string {
  const combined = namespace + name;
  const hash = simpleHash(combined);

  // Format as UUID-like string
  const padded = hash.padStart(32, '0');
  return [
    padded.slice(0, 8),
    padded.slice(8, 12),
    '5' + padded.slice(13, 16), // Version 5
    ((parseInt(padded.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + padded.slice(18, 20),
    padded.slice(20, 32)
  ].join('-');
}

/**
 * Creates a segment hash for a code block
 * @param filePath File path
 * @param startLine Start line number
 * @param endLine End line number
 * @param contentLength Content length
 * @param contentPreview First 100 chars of content
 * @returns Hash string
 */
export function createSegmentHash(
  filePath: string,
  startLine: number,
  endLine: number,
  contentLength: number,
  contentPreview: string
): string {
  const input = `${filePath}-${startLine}-${endLine}-${contentLength}-${contentPreview}`;
  return createHashSync(input);
}

/**
 * Checks if two hashes are equal
 * @param hash1 First hash
 * @param hash2 Second hash
 * @returns True if hashes are equal
 */
export function hashesEqual(hash1: string | undefined, hash2: string | undefined): boolean {
  if (!hash1 || !hash2) return false;
  return hash1 === hash2;
}
