#!/usr/bin/env node

/**
 * Tests for tools/branding-drift-scanner/scan.sh (SFA-018).
 *
 * Run with:
 *   node --test tests/branding-drift-scanner.test.mjs
 *
 * Uses Node.js built-in test runner (node:test) and assertions (node:assert/strict).
 *
 * Test checklist:
 *   [x] positive detection test  — scanner exits 1 when legacy branding is present
 *   [x] false-positive exclusion test — allowlisted words (e.g. "tsunami") are not flagged
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const SCANNER = join(REPO_ROOT, 'tools', 'branding-drift-scanner', 'scan.sh');

// ── Helper ─────────────────────────────────────────────────────────────────

/**
 * Runs the branding drift scanner against a temporary directory that
 * contains a single TypeScript file with the given content.
 *
 * Returns { status, stdout, stderr }.
 */
function runScannerOnContent(filename, content) {
  const dir = mkdtempSync(join(tmpdir(), 'branding-drift-test-'));
  try {
    writeFileSync(join(dir, filename), content, 'utf8');
    const result = spawnSync('bash', [SCANNER, '--repo-root', dir], {
      encoding: 'utf8',
      timeout: 15_000,
    });
    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Positive Detection Tests ────────────────────────────────────────────────

describe('branding drift scanner — positive detection', () => {

  it('detects "Kortix" in a .tsx file and exits with code 1', () => {
    const { status, stdout } = runScannerOnContent(
      'header.tsx',
      'export const AppName = "Kortix IDE";',
    );
    assert.equal(status, 1, 'scanner should exit 1 when legacy term is found');
    assert.match(stdout, /LEGACY BRANDING VIOLATIONS FOUND/,
      'stdout should report legacy branding violations');
  });

  it('detects lowercase "kortix" in a .ts file and exits with code 1', () => {
    const { status, stdout } = runScannerOnContent(
      'config.ts',
      'const API_URL = "https://api.kortix.com/v1";',
    );
    assert.equal(status, 1);
    assert.match(stdout, /LEGACY BRANDING VIOLATIONS FOUND/);
  });

  it('detects "suna" as a standalone brand term in a .tsx file and exits with code 1', () => {
    const { status, stdout } = runScannerOnContent(
      'page.tsx',
      'export default function SunaPage() { return <h1>Suna</h1>; }',
    );
    assert.equal(status, 1);
    assert.match(stdout, /LEGACY BRANDING VIOLATIONS FOUND/);
  });

  it('detects "bolt.new" in a .md file and exits with code 1', () => {
    const { status, stdout } = runScannerOnContent(
      'README.md',
      '# Inspired by bolt.new\n\nThis tool is similar to bolt.new.',
    );
    assert.equal(status, 1);
    assert.match(stdout, /LEGACY BRANDING VIOLATIONS FOUND/);
  });

  it('detects "bolt-elements" in a .ts file and exits with code 1', () => {
    const { status, stdout } = runScannerOnContent(
      'utils.ts',
      'import { Button } from "bolt-elements";',
    );
    assert.equal(status, 1);
    assert.match(stdout, /LEGACY BRANDING VIOLATIONS FOUND/);
  });

  it('reports the matching file path in the output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'branding-drift-test-'));
    try {
      writeFileSync(join(dir, 'app.tsx'), 'const brand = "Kortix";', 'utf8');
      const result = spawnSync('bash', [SCANNER, '--repo-root', dir], {
        encoding: 'utf8',
        timeout: 15_000,
      });
      assert.equal(result.status, 1);
      assert.match(result.stdout, /app\.tsx/,
        'output should include the filename of the violating file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

});

// ── False-Positive Exclusion Tests ──────────────────────────────────────────

describe('branding drift scanner — false-positive exclusion', () => {

  it('does not flag "tsunami" (contains "suna" substring) — exits 0', () => {
    const { status, stdout } = runScannerOnContent(
      'geo.ts',
      'const warning = "Tsunami alert issued for coastal areas.";',
    );
    assert.equal(status, 0,
      'scanner should exit 0 for allowlisted suna-containing word "tsunami"');
    assert.match(stdout, /No legacy branding violations found/,
      'stdout should confirm no violations');
  });

  it('does not flag "tsunamis" — exits 0', () => {
    const { status } = runScannerOnContent(
      'alert.ts',
      'export const NATURAL_DISASTERS = ["tsunamis", "earthquakes", "floods"];',
    );
    assert.equal(status, 0);
  });

  it('does not flag "nessuna" (Italian for "none") — exits 0', () => {
    const { status } = runScannerOnContent(
      'it.json',
      '{ "empty": "nessuna corrispondenza trovata" }',
    );
    assert.equal(status, 0);
  });

  it('exits 0 when a clean file contains no legacy terms', () => {
    const { status, stdout } = runScannerOnContent(
      'clean.tsx',
      'export const APP_NAME = "Recoder";',
    );
    assert.equal(status, 0);
    assert.match(stdout, /No legacy branding violations found/);
  });

  it('does not flag files inside node_modules (excluded dir)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'branding-drift-test-'));
    try {
      const nmDir = join(dir, 'node_modules', 'some-pkg');
      mkdirSync(nmDir, { recursive: true });
      writeFileSync(join(nmDir, 'index.ts'), 'const x = "kortix";', 'utf8');
      const result = spawnSync('bash', [SCANNER, '--repo-root', dir], {
        encoding: 'utf8',
        timeout: 15_000,
      });
      assert.equal(result.status, 0,
        'files inside node_modules should be excluded from scanning');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

});
