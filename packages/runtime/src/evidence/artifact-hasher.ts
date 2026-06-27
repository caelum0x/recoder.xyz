import { createHash } from 'node:crypto';

/**
 * Content hashing for artifact provenance. Every captured artifact body is sha256-hashed so
 * the control plane can verify it was not altered, satisfying the repo rule that evidence
 * carries verifiable provenance.
 */
export function hashContent(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

export type HashedArtifactBody = {
  sha256: string;
  byteLength: number;
};

export function hashArtifactBody(content: string | Uint8Array): HashedArtifactBody {
  const byteLength =
    typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : content.byteLength;
  return { sha256: hashContent(content), byteLength };
}
