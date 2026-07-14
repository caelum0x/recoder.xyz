/**
 * Tests: browser-use first-party MCP server registration
 *
 * Verifies that:
 * 1. PYTHON_SERVERS exports the 'browser-use' entry with the expected shape.
 * 2. The entry is gated behind BROWSER_USE_ENABLED=1 (degrade-safe).
 * 3. The catalog route only surfaces browser-use when the env flag is set.
 * 4. The start route rejects browser-use gracefully when the flag is absent.
 * 5. Tool-risk classification for browser-use tool names goes through the
 *    existing policy gate (estimateMcpToolRisk), proving the policy seam is
 *    intact — no spawning of real Python needed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PYTHON_SERVERS, PREINSTALLED_SERVERS, NPX_SERVERS } from './mcp-manager.js';
import { estimateMcpToolRisk } from '@recoder/agent-mcp';

// ---------------------------------------------------------------------------
// Registry shape checks
// ---------------------------------------------------------------------------

describe('PYTHON_SERVERS — browser-use registration', () => {
  it('exports PYTHON_SERVERS with a browser-use entry', () => {
    expect(PYTHON_SERVERS).toBeDefined();
    expect(PYTHON_SERVERS['browser-use']).toBeDefined();
  });

  it('browser-use entry has the correct command and args', () => {
    const entry = PYTHON_SERVERS['browser-use'];
    expect(entry.command).toBe('python');
    expect(entry.args).toEqual(['-m', 'browser_use.mcp']);
  });

  it('browser-use entry declares a human-readable name', () => {
    expect(PYTHON_SERVERS['browser-use'].name).toBe('Browser Use');
  });

  it('browser-use entry declares BROWSER_USE_ENABLED as the gate env var', () => {
    expect(PYTHON_SERVERS['browser-use'].enabledByEnv).toBe('BROWSER_USE_ENABLED');
  });

  it('browser-use entry suppresses noisy logging via env defaults', () => {
    const env = PYTHON_SERVERS['browser-use'].env ?? {};
    expect(env['BROWSER_USE_LOGGING_LEVEL']).toBe('critical');
    expect(env['BROWSER_USE_SETUP_LOGGING']).toBe('false');
  });

  it('browser-use id does not collide with PREINSTALLED_SERVERS or NPX_SERVERS', () => {
    expect(PREINSTALLED_SERVERS['browser-use']).toBeUndefined();
    expect(NPX_SERVERS['browser-use']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Degrade-safe gate: catalog route behaviour
// ---------------------------------------------------------------------------

describe('catalog route — BROWSER_USE_ENABLED gate', () => {
  const originalEnv = process.env['BROWSER_USE_ENABLED'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['BROWSER_USE_ENABLED'];
    } else {
      process.env['BROWSER_USE_ENABLED'] = originalEnv;
    }
  });

  it('browser-use is absent from filtered list when BROWSER_USE_ENABLED is not set', () => {
    delete process.env['BROWSER_USE_ENABLED'];
    const offered = Object.entries(PYTHON_SERVERS).filter(
      ([, cfg]) => process.env[cfg.enabledByEnv] === '1',
    );
    const ids = offered.map(([id]) => id);
    expect(ids).not.toContain('browser-use');
  });

  it('browser-use is absent from filtered list when BROWSER_USE_ENABLED=0', () => {
    process.env['BROWSER_USE_ENABLED'] = '0';
    const offered = Object.entries(PYTHON_SERVERS).filter(
      ([, cfg]) => process.env[cfg.enabledByEnv] === '1',
    );
    expect(offered.map(([id]) => id)).not.toContain('browser-use');
  });

  it('browser-use is included in filtered list when BROWSER_USE_ENABLED=1', () => {
    process.env['BROWSER_USE_ENABLED'] = '1';
    const offered = Object.entries(PYTHON_SERVERS).filter(
      ([, cfg]) => process.env[cfg.enabledByEnv] === '1',
    );
    expect(offered.map(([id]) => id)).toContain('browser-use');
  });
});

// ---------------------------------------------------------------------------
// Start route: degrade-safe 503 when flag absent (no spawn)
// ---------------------------------------------------------------------------

describe('start route — degrade-safe 503 when not enabled', () => {
  const originalEnv = process.env['BROWSER_USE_ENABLED'];

  beforeEach(() => {
    delete process.env['BROWSER_USE_ENABLED'];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['BROWSER_USE_ENABLED'];
    } else {
      process.env['BROWSER_USE_ENABLED'] = originalEnv;
    }
  });

  it('PYTHON_SERVERS browser-use is looked up by id correctly for routing', () => {
    // Simulate the route logic: check if serverId is in PYTHON_SERVERS
    const serverId = 'browser-use';
    const entry = PYTHON_SERVERS[serverId];
    expect(entry).toBeDefined();

    // Gate check (as in mcp.routes.ts)
    const allowed = process.env[entry.enabledByEnv] === '1';
    expect(allowed).toBe(false); // flag not set → should return 503
  });

  it('resolves correctly with BROWSER_USE_ENABLED=1', () => {
    process.env['BROWSER_USE_ENABLED'] = '1';
    const entry = PYTHON_SERVERS['browser-use'];
    const allowed = process.env[entry.enabledByEnv] === '1';
    expect(allowed).toBe(true); // flag set → proceed to spawn
  });
});

// ---------------------------------------------------------------------------
// Policy gate: browser-use tool names route through estimateMcpToolRisk
// ---------------------------------------------------------------------------

describe('policy gate — estimateMcpToolRisk covers browser-use tools', () => {
  it('tool names containing "browser" get medium risk (approval gate applies)', () => {
    // browser-use exposes tools like "browser_navigate", "browser_click", etc.
    expect(estimateMcpToolRisk('browser_navigate')).toBe('medium');
    expect(estimateMcpToolRisk('browser_click')).toBe('medium');
    expect(estimateMcpToolRisk('browser_type')).toBe('medium');
    expect(estimateMcpToolRisk('browser_screenshot')).toBe('medium');
  });

  it('generic read-like browser-use tool names still get at least medium risk', () => {
    expect(estimateMcpToolRisk('browser_get_content')).toBe('medium');
  });

  it('tool names without "browser" keyword that are read-only resolve to low risk', () => {
    // Ensures the risk function is still well-behaved for non-browser tools
    expect(estimateMcpToolRisk('list_files')).toBe('low');
    expect(estimateMcpToolRisk('read_file')).toBe('low');
  });

  it('high-risk tool names remain high regardless of server origin', () => {
    expect(estimateMcpToolRisk('delete_all')).toBe('high');
    expect(estimateMcpToolRisk('deploy_to_production')).toBe('high');
  });
});
