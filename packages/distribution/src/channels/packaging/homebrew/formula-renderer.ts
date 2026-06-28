import { HomebrewFormulaSchema, type HomebrewFormula } from '../../../domain/tap-formula';

/**
 * Render a Homebrew formula. The output is byte-compatible with the live
 * `homebrew-recoder/Formula/recoder-code.rb`: a `Formula` subclass with `desc`,
 * `homepage`, npm tgz `url`, `sha256`, `license`, a `depends_on` node line, the
 * standard npm `install`, and a `--version` `test`.
 *
 * Inputs are validated (Zod) before rendering — a malformed sha256 or a
 * non-URL is a hard error, not a silently-broken formula.
 */
export function renderFormula(input: HomebrewFormula): string {
  const f = HomebrewFormulaSchema.parse(input);
  return `class ${f.className} < Formula
  desc "${escapeRuby(f.desc)}"
  homepage "${f.homepage}"
  url "${f.url}"
  sha256 "${f.sha256}"
  license "${escapeRuby(f.license)}"

  depends_on "${f.nodeDependency}"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/${f.binaryName} --version")
  end
end
`;
}

/** Escape a double-quoted Ruby string literal. */
function escapeRuby(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
