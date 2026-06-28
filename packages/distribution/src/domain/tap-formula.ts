import { z } from 'zod';

/**
 * The inputs needed to render a Homebrew formula. Shape is taken directly from
 * the live `homebrew-recoder/Formula/recoder-code.rb`: a class name, the npm
 * tgz `url`, the `sha256`, the node dependency, and a `--version` test.
 */
export interface HomebrewFormula {
  /** The Ruby class name, e.g. `RecoderCode`. */
  readonly className: string;
  readonly desc: string;
  readonly homepage: string;
  readonly url: string;
  readonly sha256: string;
  readonly license: string;
  /** The brew dependency, e.g. `node@20`. */
  readonly nodeDependency: string;
  /** The CLI binary name used in the `test` block, e.g. `recoder-code`. */
  readonly binaryName: string;
  /** The version the `--version` test asserts on. */
  readonly version: string;
}

export const HomebrewFormulaSchema: z.ZodType<HomebrewFormula> = z.object({
  className: z.string().regex(/^[A-Z][A-Za-z0-9]*$/, 'className must be a Ruby class name'),
  desc: z.string().min(1),
  homepage: z.string().url(),
  url: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, 'sha256 must be 64 lowercase hex chars'),
  license: z.string().min(1),
  nodeDependency: z.string().min(1),
  binaryName: z.string().min(1),
  version: z.string().min(1),
});
