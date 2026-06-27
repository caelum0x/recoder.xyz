/**
 * Stable, deterministic string hash. MERGED from the private `hashString` in
 * `packages/agent-os/src/services/work-lock-service.ts`. Used to derive ids and
 * dedup keys. NOT cryptographic — never use for security/signing.
 */

export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

/** Hex-encoded absolute hash, suitable as an id/dedup-key fragment. */
export function hashHex(value: string): string {
  return Math.abs(hashString(value)).toString(16);
}

/** Stable hash of an ordered list of parts joined by a separator. */
export function hashParts(parts: ReadonlyArray<string>, separator = ':'): string {
  return hashHex(parts.join(separator));
}
