/**
 * @module recoder-envelope.dist-roundtrip.test
 *
 * Round-trip smoke test for the *shipped CJS dist* of the Recoder A2A wire
 * envelope contract.
 *
 * The existing vitest suite (`../types.envelope-validation.test.ts`) exercises
 * the TypeScript *source*. This file is intentionally different: it `require()`s
 * the committed `.js` artifacts that consumers actually load through the
 * package `exports` `"require"` condition (`@recoder/shared/a2a`,
 * `@recoder/shared/a2a/schemas`). It guards against the shipped `.js`/`.d.ts`
 * drifting away from the `.ts` source -- a class of bug that source-only tests
 * cannot catch.
 *
 * Runner: Node's built-in test runner. No transpiler, no bundler -- exactly the
 * load path a CJS consumer sees.
 *
 *   node --test src/a2a/schemas/recoder-envelope.dist-roundtrip.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Load through the same module specifiers the package `exports` map points the
// `"require"` condition at, resolved relative to this test file.
const envelopeSchemaMod = require('./recoder-envelope.js');
const a2aTypesMod = require('../types.js');
const a2aIndexMod = require('../index.js');
const schemasIndexMod = require('./index.js');

const CANONICAL_ENVELOPE_VERSION = '2026-02-14';
const CANONICAL_PROTOCOL_VERSION = '0.3.0';

function validEnvelope() {
  return {
    envelopeVersion: CANONICAL_ENVELOPE_VERSION,
    protocolVersion: CANONICAL_PROTOCOL_VERSION,
    messageId: 'msg-1',
    threadId: 'thr-1',
    createdAt: '2026-06-28T10:00:00.000Z',
    from: { id: 'a1', name: 'Requester', platform: 'recoder_pm' },
    to: { id: 'a2', name: 'Assignee', platform: 'codex' },
    intent: 'execute',
    payload: [{ kind: 'text', text: 'do the thing' }],
  };
}

// ---------------------------------------------------------------------------
// require() smoke: the shipped artifacts load and surface the contract
// ---------------------------------------------------------------------------

test('shipped CJS modules require() cleanly and surface the contract', () => {
  // Leaf schema module.
  assert.equal(typeof envelopeSchemaMod.RecoderA2AEnvelopeSchema, 'object');
  assert.equal(typeof envelopeSchemaMod.RecoderPayloadSchema, 'object');
  assert.equal(typeof envelopeSchemaMod.getRecoderA2AEnvelopeSchema, 'function');

  // types facade module (validate API).
  for (const fn of [
    'validateRecoderA2AEnvelope',
    'isRecoderA2AEnvelope',
    'assertRecoderA2AEnvelope',
    'parseRecoderA2AEnvelope',
  ]) {
    assert.equal(typeof a2aTypesMod[fn], 'function', `${fn} should be a function`);
  }
  assert.equal(typeof a2aTypesMod.RecoderA2AEnvelopeValidationError, 'function');

  // The Zod schemas must be re-exported through the `types` facade too (live
  // binding forwarding under CJS interop).
  assert.equal(typeof a2aTypesMod.RecoderA2AEnvelopeSchema, 'object');
  assert.equal(typeof a2aTypesMod.RecoderPayloadSchema, 'object');

  // Public barrels: `@recoder/shared/a2a` and `@recoder/shared/a2a/schemas`.
  assert.equal(typeof a2aIndexMod.validateRecoderA2AEnvelope, 'function');
  assert.equal(typeof a2aIndexMod.RecoderA2AEnvelopeSchema, 'object');
  assert.equal(typeof schemasIndexMod.RecoderA2AEnvelopeSchema, 'object');
  assert.equal(typeof schemasIndexMod.RecoderPayloadSchema, 'object');
});

// ---------------------------------------------------------------------------
// Round-trip: a valid envelope validates through every shipped entry point
// ---------------------------------------------------------------------------

test('valid envelope round-trips through the shipped validate API', () => {
  const env = validEnvelope();

  assert.deepEqual(a2aTypesMod.validateRecoderA2AEnvelope(env), []);
  assert.equal(a2aTypesMod.isRecoderA2AEnvelope(env), true);
  assert.equal(a2aTypesMod.parseRecoderA2AEnvelope(env).messageId, 'msg-1');

  // Same envelope must pass the public barrel and the raw Zod schema.
  assert.deepEqual(a2aIndexMod.validateRecoderA2AEnvelope(env), []);
  const parsed = envelopeSchemaMod.RecoderA2AEnvelopeSchema.safeParse(env);
  assert.equal(parsed.success, true);
});

test('strictVersion pins the canonical versions through the shipped API', () => {
  const env = validEnvelope();
  assert.deepEqual(a2aTypesMod.validateRecoderA2AEnvelope(env, { strictVersion: true }), []);

  const drifted = { ...env, envelopeVersion: '9.9.9' };
  const issues = a2aTypesMod.validateRecoderA2AEnvelope(drifted, { strictVersion: true });
  assert.ok(issues.some((i) => i.path === 'envelopeVersion'));
});

// ---------------------------------------------------------------------------
// Malformed-reject: the tightened payload union closes the `unknown[]` hole
// ---------------------------------------------------------------------------

test('non-object envelope is rejected with a single $ issue', () => {
  for (const bad of [null, undefined, 'str', 42, true, [1, 2]]) {
    assert.deepEqual(a2aTypesMod.validateRecoderA2AEnvelope(bad), [
      { path: '$', message: 'envelope must be an object' },
    ]);
  }
});

test('missing required top-level fields are reported by name', () => {
  const issues = a2aTypesMod.validateRecoderA2AEnvelope({});
  const paths = issues.map((i) => i.path);
  for (const field of [
    'envelopeVersion',
    'protocolVersion',
    'messageId',
    'threadId',
    'createdAt',
    'from',
    'to',
    'intent',
    'payload',
  ]) {
    assert.ok(paths.includes(field), `expected an issue for ${field}`);
  }
});

test('payload part with an unknown kind is rejected (tightened union)', () => {
  const env = validEnvelope();
  const issues = a2aTypesMod.validateRecoderA2AEnvelope({
    ...env,
    payload: [{ kind: 'mystery', text: 'x' }],
  });
  assert.ok(issues.length > 0);
  assert.ok(issues.some((i) => i.path.startsWith('payload')));
});

test('arbitrary non-payload object in the payload array is rejected', () => {
  const env = validEnvelope();
  const issues = a2aTypesMod.validateRecoderA2AEnvelope({
    ...env,
    payload: [{ foo: 'bar' }],
  });
  assert.ok(issues.length > 0);
});

test('artifact payload with an out-of-set artifactType is rejected', () => {
  const env = validEnvelope();
  const issues = a2aTypesMod.validateRecoderA2AEnvelope({
    ...env,
    payload: [{ kind: 'artifact', artifactType: 'zipbomb', mimeType: 'text/plain', content: 'x' }],
  });
  assert.ok(issues.some((i) => i.path.includes('artifactType')));
});

test('whitespace-only text payload is rejected with a precise path', () => {
  const env = validEnvelope();
  const issues = a2aTypesMod.validateRecoderA2AEnvelope({
    ...env,
    payload: [{ kind: 'text', text: '   ' }],
  });
  assert.ok(issues.some((i) => i.path === 'payload[0].text'));
});

test('unknown platform is rejected (closed set)', () => {
  const env = validEnvelope();
  const issues = a2aTypesMod.validateRecoderA2AEnvelope({
    ...env,
    to: { id: 'a2', name: 'A', platform: 'totally_fake' },
  });
  assert.ok(issues.some((i) => i.path === 'to.platform'));
});

test('assert/parse throw the typed error on malformed input', () => {
  assert.throws(
    () => a2aTypesMod.assertRecoderA2AEnvelope({}),
    (err) =>
      err instanceof a2aTypesMod.RecoderA2AEnvelopeValidationError &&
      Array.isArray(err.issues) &&
      err.issues.length > 0
  );
  assert.throws(() => a2aTypesMod.parseRecoderA2AEnvelope({ kind: 'nope' }));
});

test('every known payload variant is accepted', () => {
  const env = validEnvelope();
  assert.deepEqual(
    a2aTypesMod.validateRecoderA2AEnvelope({
      ...env,
      payload: [
        { kind: 'text', text: 'hi' },
        { kind: 'json', data: { a: 1 } },
        { kind: 'command', command: 'ls', args: ['-la'], cwd: '/tmp' },
        { kind: 'artifact', artifactType: 'patch', mimeType: 'text/x-diff', content: '@@ -1 +1 @@' },
      ],
    }),
    []
  );
});

test('RecoderPayloadSchema mirrors the union directly', () => {
  assert.equal(
    envelopeSchemaMod.RecoderPayloadSchema.safeParse({ kind: 'text', text: 'ok' }).success,
    true
  );
  assert.equal(
    envelopeSchemaMod.RecoderPayloadSchema.safeParse({ kind: 'nope' }).success,
    false
  );
});
