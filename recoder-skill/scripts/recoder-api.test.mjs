#!/usr/bin/env node

/**
 * Smoke tests for recoder-api.mjs CLI script.
 *
 * Run with:
 *   node --test recoder-api.test.mjs
 *
 * Uses Node.js built-in test runner (node:test) and assertions (node:assert/strict).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, 'recoder-api.mjs');

// ── Helper: run the CLI script as a subprocess ─────────────────────

/**
 * Spawns the CLI script with the given args and env overrides.
 * Returns { code, stdout, stderr }.
 */
function runCLI(args = [], envOverrides = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...envOverrides };
    // Remove RECODER_API_KEY by default unless explicitly provided
    if (!('RECODER_API_KEY' in envOverrides)) {
      delete env.RECODER_API_KEY;
    }

    execFile(
      process.execPath,
      [SCRIPT, ...args],
      { env, timeout: 10_000 },
      (error, stdout, stderr) => {
        resolve({
          code: error ? error.code ?? 1 : 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      },
    );
  });
}

// ── Inline parseArgs (extracted for unit testing) ──────────────────

/**
 * Mirror of parseArgs from recoder-api.mjs so we can unit-test it
 * without importing the script (which has top-level side effects).
 */
function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      parsed[key] = val;
      if (val !== true) i++;
    }
  }
  return parsed;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('recoder-api.mjs CLI smoke tests', () => {

  // 1. Missing RECODER_API_KEY → exit 1 with error message
  it('exits with code 1 when RECODER_API_KEY is not set', async () => {
    const { code, stderr } = await runCLI(['list'], {
      // Explicitly ensure key is absent
      RECODER_API_KEY: undefined,
    });

    assert.equal(code, 1, 'should exit with code 1');
    assert.match(stderr, /RECODER_API_KEY/, 'stderr should mention RECODER_API_KEY');
    assert.match(stderr, /not set/, 'stderr should say "not set"');
  });

  // 2. No arguments → usage help + exit 1
  it('shows usage help and exits with code 1 when called with no arguments', async () => {
    const { code, stderr } = await runCLI([], {
      RECODER_API_KEY: 'test-key-for-smoke',
    });

    assert.equal(code, 1, 'should exit with code 1');
    assert.match(stderr, /Usage:/, 'stderr should contain "Usage:"');
    assert.match(stderr, /Commands:/, 'stderr should contain "Commands:"');
    assert.match(stderr, /create/, 'stderr should list the create command');
    assert.match(stderr, /prompt/, 'stderr should list the prompt command');
    assert.match(stderr, /preview/, 'stderr should list the preview command');
    assert.match(stderr, /list/, 'stderr should list the list command');
    assert.match(stderr, /publish/, 'stderr should list the publish command');
  });

  // 3. Invalid command → usage help + exit 1
  it('shows usage help and exits with code 1 for an invalid command', async () => {
    const { code, stderr } = await runCLI(['notacommand'], {
      RECODER_API_KEY: 'test-key-for-smoke',
    });

    assert.equal(code, 1, 'should exit with code 1');
    assert.match(stderr, /Usage:/, 'stderr should contain "Usage:"');
    assert.match(stderr, /Commands:/, 'stderr should contain "Commands:"');
  });

  // 4. API key check takes precedence over missing command
  it('checks API key before validating command', async () => {
    const { code, stderr } = await runCLI([], {
      RECODER_API_KEY: undefined,
    });

    assert.equal(code, 1, 'should exit with code 1');
    assert.match(stderr, /RECODER_API_KEY/, 'should fail on missing key, not missing command');
  });
});

describe('parseArgs unit tests', () => {

  it('parses a single --key value pair', () => {
    const result = parseArgs(['--name', 'MyProject']);
    assert.deepStrictEqual(result, { name: 'MyProject' });
  });

  it('parses multiple --key value pairs', () => {
    const result = parseArgs(['--project', 'abc123', '--prompt', 'Add dark mode']);
    assert.deepStrictEqual(result, { project: 'abc123', prompt: 'Add dark mode' });
  });

  it('treats a flag without a following value as boolean true', () => {
    const result = parseArgs(['--verbose']);
    assert.deepStrictEqual(result, { verbose: true });
  });

  it('treats a flag followed by another flag as boolean true', () => {
    const result = parseArgs(['--verbose', '--name', 'test']);
    assert.deepStrictEqual(result, { verbose: true, name: 'test' });
  });

  it('returns an empty object for no arguments', () => {
    const result = parseArgs([]);
    assert.deepStrictEqual(result, {});
  });

  it('ignores positional arguments that do not start with --', () => {
    const result = parseArgs(['positional', '--name', 'test']);
    assert.deepStrictEqual(result, { name: 'test' });
  });

  it('handles value that looks like a flag correctly (-- prefix)', () => {
    // If the "value" starts with --, it is treated as a new flag, not a value
    const result = parseArgs(['--first', '--second', 'val']);
    assert.deepStrictEqual(result, { first: true, second: 'val' });
  });

  it('handles mixed flags and key-value pairs', () => {
    const result = parseArgs([
      '--name', 'MyApp',
      '--template', 'react',
      '--debug',
      '--description', 'A cool app',
    ]);
    assert.deepStrictEqual(result, {
      name: 'MyApp',
      template: 'react',
      debug: true,
      description: 'A cool app',
    });
  });
});
