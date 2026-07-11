/**
 * Tests for TensorZeroLogger (packages/runtime observability seam).
 *
 * Asserts the degrade-safe contract when the gateway is unconfigured or
 * unreachable. No real gateway or Rust binary is required.
 *
 * Uses node:test / node:assert (the pattern for packages/runtime tests).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TensorZeroLogger, createTensorZeroLogger } from '../../../src/observability/tensorzero-logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe('TensorZeroLogger: configuration', () => {
  test('configured=false when no gatewayUrl and TENSORZERO_URL not set', () => {
    const savedUrl = process.env['TENSORZERO_URL'];
    delete process.env['TENSORZERO_URL'];
    try {
      const logger = new TensorZeroLogger();
      assert.equal(logger.configured, false);
      assert.equal(logger.gatewayUrl, undefined);
    } finally {
      if (savedUrl !== undefined) process.env['TENSORZERO_URL'] = savedUrl;
    }
  });

  test('configured=true when explicit gatewayUrl is provided', () => {
    const logger = new TensorZeroLogger({ gatewayUrl: 'http://127.0.0.1:3778' });
    assert.equal(logger.configured, true);
    assert.equal(logger.gatewayUrl, 'http://127.0.0.1:3778');
  });

  test('createTensorZeroLogger factory returns a TensorZeroLogger', () => {
    const logger = createTensorZeroLogger({ gatewayUrl: 'http://127.0.0.1:3778' });
    assert.ok(logger instanceof TensorZeroLogger);
  });
});

// ---------------------------------------------------------------------------
// log() — degrade-safe when unconfigured
// ---------------------------------------------------------------------------

describe('TensorZeroLogger.log(): degrade-safe when unconfigured', () => {
  test('returns { routed: false } with a reason when unconfigured', async () => {
    const savedUrl = process.env['TENSORZERO_URL'];
    delete process.env['TENSORZERO_URL'];
    try {
      const logger = new TensorZeroLogger();
      const result = await logger.log({
        function_name: 'my-fn',
        input: { messages: [{ role: 'user', content: 'hello' }] },
      });
      assert.equal(result.routed, false);
      assert.equal(typeof result.reason, 'string');
      assert.ok(result.reason!.length > 0);
      assert.equal(result.inference_id, undefined);
    } finally {
      if (savedUrl !== undefined) process.env['TENSORZERO_URL'] = savedUrl;
    }
  });

  test('never throws when unconfigured', async () => {
    const savedUrl = process.env['TENSORZERO_URL'];
    delete process.env['TENSORZERO_URL'];
    try {
      const logger = new TensorZeroLogger();
      // Should resolve, not reject.
      const result = await logger.log({ function_name: 'fn', input: { messages: [] } });
      assert.equal(result.routed, false);
    } finally {
      if (savedUrl !== undefined) process.env['TENSORZERO_URL'] = savedUrl;
    }
  });
});

// ---------------------------------------------------------------------------
// log() — degrade-safe when gateway URL set but unreachable
// ---------------------------------------------------------------------------

describe('TensorZeroLogger.log(): degrade-safe when gateway is unreachable', () => {
  test('returns { routed: false } when gateway URL points to a closed port', async () => {
    // Port 19999 is chosen to be reliably unreachable in the test environment.
    const logger = new TensorZeroLogger({
      gatewayUrl: 'http://127.0.0.1:19999',
      timeoutMs: 500,
    });
    const result = await logger.log({
      function_name: 'test-fn',
      input: { messages: [{ role: 'user', content: 'test' }] },
    });
    assert.equal(result.routed, false);
    assert.equal(typeof result.reason, 'string');
    assert.ok(result.reason!.length > 0);
  });

  test('never throws when gateway is unreachable', async () => {
    const logger = new TensorZeroLogger({
      gatewayUrl: 'http://127.0.0.1:19999',
      timeoutMs: 500,
    });
    await assert.doesNotReject(
      logger.log({ function_name: 'fn', input: { messages: [] } }),
    );
  });
});

// ---------------------------------------------------------------------------
// health() — truthful when unconfigured / unreachable
// ---------------------------------------------------------------------------

describe('TensorZeroLogger.health(): truthful health', () => {
  test('returns { available: false } when unconfigured', async () => {
    const savedUrl = process.env['TENSORZERO_URL'];
    delete process.env['TENSORZERO_URL'];
    try {
      const logger = new TensorZeroLogger();
      const h = await logger.health();
      assert.equal(h.available, false);
      assert.equal(typeof h.reason, 'string');
    } finally {
      if (savedUrl !== undefined) process.env['TENSORZERO_URL'] = savedUrl;
    }
  });

  test('returns { available: false } when gateway URL points to a closed port', async () => {
    const logger = new TensorZeroLogger({
      gatewayUrl: 'http://127.0.0.1:19999',
      timeoutMs: 500,
    });
    const h = await logger.health();
    assert.equal(h.available, false);
    assert.equal(typeof h.reason, 'string');
  });

  test('never throws from health()', async () => {
    const logger = new TensorZeroLogger({
      gatewayUrl: 'http://127.0.0.1:19999',
      timeoutMs: 500,
    });
    await assert.doesNotReject(logger.health());
  });
});
