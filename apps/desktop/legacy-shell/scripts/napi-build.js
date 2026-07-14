/**
 * napi-build.js — Degrade-safe NAPI native addon compiler.
 *
 * Builds the two committed NAPI addon crates so their `.node` binaries are
 * fresh before packaging. Skips any crate whose build fails (missing Rust
 * toolchain, disk-deferred crate, or missing Cargo.toml) rather than failing
 * the overall build — matching the degrade-safe contract in the loaders.
 *
 * Three disk-deferred crates (tensorzero, openfang, claw-code-parity) are NOT
 * built here because their `.node` binaries are intentionally deferred and their
 * loaders already degrade safely when absent.
 *
 * Usage:
 *   node scripts/napi-build.js          # build all available addons
 *   NAPI_SKIP_BUILD=1 node scripts/napi-build.js  # skip (for CI that pre-builds)
 *
 * Returns exit code 0 always (degrade-safe). Individual crate failures are
 * logged as warnings, not errors, so electron-builder's beforeBuild can call
 * this and always continue.
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Repo root is two levels up from apps/desktop.
const repoRoot = path.resolve(__dirname, '..', '..', '..');

/**
 * Crates with built-and-committed .node binaries that we rebuild before packaging.
 * Each entry: { name, crateDir, outputNode }
 *
 * crateDir: path relative to repoRoot containing Cargo.toml for the NAPI crate.
 * outputNode: expected output path relative to repoRoot (where electron-builder
 *             picks it up via extraResources).
 */
const NAPI_CRATES = [
  {
    name: 'recoder-governance-napi',
    crateDir: 'crates/recoder-governance/recoder-governance-napi',
    outputNode: 'crates/recoder-governance/target/release/recoder-governance-napi.node',
  },
  {
    name: 'lance-npm-bindings',
    crateDir: 'crates/lance/npm-bindings',
    outputNode: 'crates/lance/npm-bindings/target/release/lance_npm_bindings.node',
  },
];

/**
 * Check that the `cargo` binary is available.
 * @returns {boolean}
 */
function hasCargoToolchain() {
  try {
    execSync('cargo --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a single NAPI crate with `cargo build --release`.
 * Returns { ok: boolean, skipped?: boolean, reason?: string }.
 */
function buildCrate(crate) {
  const absoluteCrateDir = path.join(repoRoot, crate.crateDir);
  const absoluteOutput = path.join(repoRoot, crate.outputNode);

  if (!fs.existsSync(absoluteCrateDir)) {
    return {
      ok: false,
      skipped: true,
      reason: `crate directory not found: ${absoluteCrateDir} (disk-deferred)`,
    };
  }

  const cargoToml = path.join(absoluteCrateDir, 'Cargo.toml');
  if (!fs.existsSync(cargoToml)) {
    return {
      ok: false,
      skipped: true,
      reason: `Cargo.toml missing at ${cargoToml} (disk-deferred)`,
    };
  }

  try {
    console.log(`[napi-build] building ${crate.name} (cargo build --release) ...`);
    execSync('cargo build --release', {
      cwd: absoluteCrateDir,
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (!fs.existsSync(absoluteOutput)) {
    return {
      ok: false,
      skipped: false,
      reason: `cargo build succeeded but .node output missing at ${absoluteOutput}`,
    };
  }

  console.log(`[napi-build] ${crate.name} built: ${absoluteOutput}`);
  return { ok: true };
}

function main() {
  if (process.env.NAPI_SKIP_BUILD === '1') {
    console.log('[napi-build] NAPI_SKIP_BUILD=1 — skipping all NAPI crate builds.');
    return;
  }

  if (!hasCargoToolchain()) {
    console.warn(
      '[napi-build] WARNING: cargo not found — skipping all NAPI crate builds. ' +
        'Pre-built .node binaries (if committed) will be used as-is.',
    );
    return;
  }

  let built = 0;
  let skipped = 0;
  let failed = 0;

  for (const crate of NAPI_CRATES) {
    const result = buildCrate(crate);
    if (result.ok) {
      built += 1;
    } else if (result.skipped) {
      console.warn(`[napi-build] SKIP ${crate.name}: ${result.reason}`);
      skipped += 1;
    } else {
      console.warn(
        `[napi-build] WARNING: failed to build ${crate.name}: ${result.reason}. ` +
          'Pre-built .node binary (if present) will be used as-is. ' +
          'This is a non-fatal degradation — the build continues.',
      );
      failed += 1;
    }
  }

  console.log(
    `[napi-build] done: ${built} built, ${skipped} skipped (disk-deferred), ` +
      `${failed} failed (non-fatal, pre-built .node used if present).`,
  );
  // Always exit 0 — degrade-safe. A build failure does not break packaging when
  // a committed pre-built .node exists at the extraResources source path.
}

main();
