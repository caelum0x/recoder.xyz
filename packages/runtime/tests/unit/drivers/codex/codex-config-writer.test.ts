import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMergedConfig } from '../../../../src/drivers/codex/codex-config-writer';
import type { UnifiedMcpRegistryServer } from '../../../../src/drivers/codex/codex-mcp-registry';

const server: UnifiedMcpRegistryServer = {
  name: 'recoder',
  command: 'node',
  args: ['/path/to/server.js'],
  enabled: true,
  startupTimeoutSec: 5,
};

test('writes managed model + reasoning effort at the TOML root', () => {
  const out = buildMergedConfig('', { model: 'gpt-5.4', reasoningEffort: 'high' });
  assert.match(out, /^model = "gpt-5\.4"/m);
  assert.match(out, /model_reasoning_effort = "high"/);
});

test('preserves user-authored config outside the managed block', () => {
  const existing = ['# my config', 'approval_policy = "never"', '', '[tui]', 'theme = "dark"'].join(
    '\n',
  );
  const out = buildMergedConfig(existing, { model: 'gpt-5.4' });
  assert.match(out, /approval_policy = "never"/);
  assert.match(out, /\[tui\]/);
  assert.match(out, /theme = "dark"/);
});

test('emits a marker-bounded MCP server table block', () => {
  const out = buildMergedConfig('', { mcpServers: [server] });
  assert.match(out, /Recoder runtime managed MCP servers \(begin\)/);
  assert.match(out, /\[mcp_servers\.recoder\]/);
  assert.match(out, /command = "node"/);
  assert.match(out, /args = \["\/path\/to\/server\.js"\]/);
  assert.match(out, /startup_timeout_sec = 5/);
  assert.match(out, /Recoder runtime managed MCP servers \(end\)/);
});

test('re-running is idempotent (does not duplicate managed keys or blocks)', () => {
  const once = buildMergedConfig('', { model: 'gpt-5.4', mcpServers: [server] });
  const twice = buildMergedConfig(once, { model: 'gpt-5.4', mcpServers: [server] });
  const modelCount = (twice.match(/^model = /gm) ?? []).length;
  assert.equal(modelCount, 1, 'model key not duplicated');
  const beginCount = (twice.match(/managed MCP servers \(begin\)/g) ?? []).length;
  assert.equal(beginCount, 1, 'managed block not duplicated');
});

test('changing the model replaces (not appends) the managed root key', () => {
  const first = buildMergedConfig('', { model: 'gpt-5.4' });
  const second = buildMergedConfig(first, { model: 'gpt-5.4-mini' });
  assert.match(second, /model = "gpt-5\.4-mini"/);
  assert.ok(!second.includes('model = "gpt-5.4"\n'));
});

test('quotes + escapes non-bare MCP server names', () => {
  const weird: UnifiedMcpRegistryServer = { ...server, name: 'my server' };
  const out = buildMergedConfig('', { mcpServers: [weird] });
  assert.match(out, /\[mcp_servers\."my server"\]/);
});
