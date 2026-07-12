'use strict';
/**
 * Drift guard: the Recoder capability bridge (recoder-capability-tools.cjs) is
 * vendored identically into each agent-facing stdio server package. If any copy
 * diverges, the distributed agents get a different tool set than the product —
 * exactly the drift this module was created to kill. This test fails loudly when
 * the copies are no longer byte-identical, and verifies the shared surface loads.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CANONICAL = path.resolve(__dirname, '..', 'recoder-capability-tools.cjs');
const COPIES = [
  CANONICAL,
  path.join(ROOT, 'packages/recoder-a2a/recoder-capability-tools.cjs'),
  path.join(ROOT, 'packages/recoder-code/packages/cli/mcp/recoder-capability-tools.cjs'),
];

test('every vendored copy of recoder-capability-tools.cjs is byte-identical', () => {
  const canonical = fs.readFileSync(CANONICAL);
  for (const copy of COPIES) {
    assert.ok(fs.existsSync(copy), `missing vendored copy: ${copy}`);
    assert.ok(
      fs.readFileSync(copy).equals(canonical),
      `capability-tools copy has drifted from canonical: ${copy}\n` +
        'Re-sync it: `cp -f mcp/recoder-capability-tools.cjs <copy>`',
    );
  }
});

test('the shared bridge exposes the capability tool set and is degrade-safe', async () => {
  const { createCapabilityTools, CAPABILITY_TOOLS } = require(CANONICAL);
  assert.ok(Array.isArray(CAPABILITY_TOOLS) && CAPABILITY_TOOLS.length >= 13);
  const cap = createCapabilityTools({ agentId: 'test_agent' });
  assert.strictEqual(cap.tools.length, CAPABILITY_TOOLS.length);
  // Names it does not own fall through (null) so the host switch can handle them.
  assert.strictEqual(await cap.handleCapabilityTool('recoder_list_agents', {}), null);
  // Without INTERNAL_SERVICE_KEY it degrades truthfully, never throws or fakes.
  const msg = await cap.handleCapabilityTool('recoder_memory_search', { query: 'x' });
  assert.match(msg, /not available in this run/);
});
