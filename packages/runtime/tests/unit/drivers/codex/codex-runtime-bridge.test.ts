import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CodexRuntimeBridge,
  isBridgeEnabled,
  resolveRuntimeBinaryPath,
} from '../../../../src/drivers/codex/codex-runtime-bridge';

test('bridge is opt-in only: disabled unless OMX_RUNTIME_BRIDGE === "1"', () => {
  assert.equal(isBridgeEnabled({}), false);
  assert.equal(isBridgeEnabled({ OMX_RUNTIME_BRIDGE: '0' }), false);
  assert.equal(isBridgeEnabled({ OMX_RUNTIME_BRIDGE: 'true' }), false);
  assert.equal(isBridgeEnabled({ OMX_RUNTIME_BRIDGE: '1' }), true);
});

test('a disabled bridge reports not-enabled and returns null snapshots (fail-open)', () => {
  const bridge = new CodexRuntimeBridge({ env: {}, exists: () => true });
  assert.equal(bridge.isEnabled(), false);
  assert.equal(bridge.readAuthority(), null);
  assert.equal(bridge.readReadiness(), null);
});

test('an enabled bridge with an absent binary stays inert (never green-washes)', () => {
  const bridge = new CodexRuntimeBridge({
    env: { OMX_RUNTIME_BRIDGE: '1' },
    exists: () => false,
  });
  assert.equal(bridge.isEnabled(), false, 'enabled requires the binary to actually exist');
  assert.equal(bridge.readReadiness(), null);
});

test('resolveRuntimeBinaryPath honors OMX_RUNTIME_BINARY override', () => {
  const resolved = resolveRuntimeBinaryPath({
    env: { OMX_RUNTIME_BINARY: '/custom/omx-runtime' },
    exists: () => false,
  });
  assert.equal(resolved, '/custom/omx-runtime');
});

test('resolveRuntimeBinaryPath falls back to PATH name when nothing on disk', () => {
  const resolved = resolveRuntimeBinaryPath({ env: { PWD: '/no/such' }, exists: () => false });
  assert.equal(resolved, 'omx-runtime');
});
