import type { HomebrewFormula } from '../../../domain/tap-formula';
import type { PackageSpec } from '../../../domain/package-spec';
import { PackageSpecSchema } from '../../../domain/package-spec';
import { renderFormula } from './formula-renderer';
import { parseSemVer, compareSemVer } from '../../../domain/semver';

/**
 * Bump an existing formula to a new npm release. The new `url` + `sha256` +
 * `version` come from the `PackageSpec` — the SAME sha256 the npm tarball
 * publish computed (one provenance hash, two channels). Refuses to bump
 * backwards (a lower version is a defect, not a no-op).
 */
export function bumpFormula(
  current: HomebrewFormula,
  spec: PackageSpec,
): { formula: HomebrewFormula; rendered: string } {
  const validSpec = PackageSpecSchema.parse(spec);

  const currentVer = parseSemVer(current.version);
  const nextVer = parseSemVer(validSpec.version);
  if (!nextVer) {
    throw new Error(`invalid target version: ${validSpec.version}`);
  }
  if (currentVer && compareSemVer(nextVer, currentVer) <= 0) {
    throw new Error(
      `refusing to bump formula backwards: ${current.version} → ${validSpec.version}`,
    );
  }

  const formula: HomebrewFormula = {
    ...current,
    url: validSpec.tarballUrl,
    sha256: validSpec.sha256,
    version: validSpec.version,
  };
  return { formula, rendered: renderFormula(formula) };
}
