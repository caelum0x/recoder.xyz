import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderFormula } from '../../../../src/channels/packaging/homebrew/formula-renderer';
import { bumpFormula } from '../../../../src/channels/packaging/homebrew/formula-bump';
import type { HomebrewFormula } from '../../../../src/domain/tap-formula';
import type { PackageSpec } from '../../../../src/domain/package-spec';

const SHA = '31ca354fe28b789735a4722599b2c33099f14c7b2f554580c7bbde6cd1f790ae';
const NEXT_SHA = 'a'.repeat(64);

const base: HomebrewFormula = {
  className: 'RecoderCode',
  desc: 'AI-powered coding assistant CLI — 40+ models, tool calling, sandbox',
  homepage: 'https://recoder.xyz',
  url: 'https://registry.npmjs.org/recoder-code/-/recoder-code-2.5.4.tgz',
  sha256: SHA,
  license: 'MIT',
  nodeDependency: 'node@20',
  binaryName: 'recoder-code',
  version: '2.5.4',
};

test('renderFormula matches the live recoder-code.rb shape', () => {
  const out = renderFormula(base);
  assert.match(out, /^class RecoderCode < Formula$/m);
  assert.ok(out.includes(`url "${base.url}"`));
  assert.ok(out.includes(`sha256 "${SHA}"`));
  assert.ok(out.includes('depends_on "node@20"'));
  assert.ok(out.includes('bin.install_symlink Dir["#{libexec}/bin/*"]'));
  assert.ok(out.includes('shell_output("#{bin}/recoder-code --version")'));
  assert.ok(out.trimEnd().endsWith('end'));
});

test('renderFormula rejects a malformed sha256 (fail fast, not a broken formula)', () => {
  assert.throws(() => renderFormula({ ...base, sha256: 'deadbeef' }), /sha256/);
});

test('bumpFormula stamps the new npm url + sha256 + version (one provenance hash)', () => {
  const spec: PackageSpec = {
    name: 'recoder-code',
    version: '2.6.0',
    tarballUrl: 'https://registry.npmjs.org/recoder-code/-/recoder-code-2.6.0.tgz',
    sha256: NEXT_SHA,
  };
  const { formula, rendered } = bumpFormula(base, spec);
  assert.equal(formula.version, '2.6.0');
  assert.equal(formula.sha256, NEXT_SHA);
  assert.ok(rendered.includes('recoder-code-2.6.0.tgz'));
  assert.ok(rendered.includes(`sha256 "${NEXT_SHA}"`));
});

test('bumpFormula refuses to bump backwards', () => {
  const spec: PackageSpec = {
    name: 'recoder-code',
    version: '2.4.0',
    tarballUrl: 'https://registry.npmjs.org/recoder-code/-/recoder-code-2.4.0.tgz',
    sha256: NEXT_SHA,
  };
  assert.throws(() => bumpFormula(base, spec), /backwards/);
});
