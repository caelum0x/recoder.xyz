import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  loadUnifiedMcpRegistry,
  mcpServersFromHostConfig,
} from '../../../../src/drivers/codex/codex-mcp-registry';

test('returns empty when no registry file exists (truthful, no fabrication)', async () => {
  const result = await loadUnifiedMcpRegistry({ candidates: ['/nonexistent/registry.json'] });
  assert.deepEqual(result.servers, []);
  assert.deepEqual(result.warnings, []);
});

test('loads + validates a registry file from disk', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'codex-mcp-'));
  const file = path.join(dir, 'mcp-registry.json');
  writeFileSync(
    file,
    JSON.stringify({
      good: { command: 'node', args: ['s.js'], enabled: true, startup_timeout_sec: 7 },
      bad: { args: ['x'] },
    }),
  );
  const result = await loadUnifiedMcpRegistry({ candidates: [file] });
  assert.equal(result.servers.length, 1);
  assert.equal(result.servers[0].name, 'good');
  assert.equal(result.servers[0].startupTimeoutSec, 7);
  assert.equal(result.warnings.length, 1, 'bad entry is warned, not trusted');
});

test('mcpServersFromHostConfig normalizes host-injected servers + skips malformed', () => {
  const result = mcpServersFromHostConfig({
    a: { command: 'node', args: ['a.js'] },
    b: { command: '' },
  });
  assert.equal(result.servers.length, 1);
  assert.equal(result.servers[0].name, 'a');
  assert.equal(result.servers[0].enabled, true, 'enabled defaults to true');
  assert.equal(result.warnings.length, 1);
});

test('mcpServersFromHostConfig tolerates undefined', () => {
  const result = mcpServersFromHostConfig(undefined);
  assert.deepEqual(result.servers, []);
});
