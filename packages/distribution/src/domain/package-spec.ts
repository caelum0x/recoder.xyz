import { z } from 'zod';
import { SemVerSchema } from './semver';

/**
 * A packaged, downloadable artifact (an npm tarball). The `sha256` is the one
 * provenance hash shared across channels — the same value the Homebrew formula
 * stamps in. Mirrors the npm registry tarball record.
 */
export interface PackageSpec {
  readonly name: string;
  readonly version: string;
  readonly tarballUrl: string;
  readonly sha256: string;
  readonly sizeBytes?: number;
}

export const PackageSpecSchema: z.ZodType<PackageSpec> = z.object({
  name: z.string().min(1),
  version: SemVerSchema,
  tarballUrl: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, 'sha256 must be 64 lowercase hex chars'),
  sizeBytes: z.number().int().nonnegative().optional(),
});
