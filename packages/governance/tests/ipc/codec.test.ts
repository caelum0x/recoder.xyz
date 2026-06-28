import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeFrame,
  decodeFrame,
  FrameDecoder,
  FrameError,
  LENGTH_PREFIX_BYTES,
  MAX_FRAME_BYTES,
} from '../../src/ipc/codec';
import {
  makeRequestEnvelope,
  parseResponseEnvelope,
} from '../../src/ipc/envelope';

describe('ipc codec — pinned wire format (4-byte big-endian length + JSON)', () => {
  it('encodes the EXACT byte layout the Rust transport must match', () => {
    // A minimal payload whose JSON byte length is known and stable.
    const value = { a: 1 };
    const json = JSON.stringify(value); // '{"a":1}' -> 7 bytes
    const frame = encodeFrame(value);

    // Prefix is exactly 4 bytes, big-endian, counting ONLY the payload.
    assert.equal(frame.length, LENGTH_PREFIX_BYTES + Buffer.byteLength(json, 'utf8'));
    assert.equal(frame.readUInt32BE(0), Buffer.byteLength(json, 'utf8'));
    // Big-endian: for length 7 the bytes are 00 00 00 07.
    assert.deepEqual([...frame.subarray(0, 4)], [0x00, 0x00, 0x00, 0x07]);
    // Payload is the raw UTF-8 JSON, no trailing newline.
    assert.equal(frame.subarray(4).toString('utf8'), json);
  });

  it('round-trips an arbitrary value through encode -> decode', () => {
    const value = { kind: 'response', id: 42, method: 'decide', nested: { x: [1, 2, 3], s: 'héllo' } };
    const frame = encodeFrame(value);
    const step = decodeFrame(frame);
    assert.deepEqual(step.value, value);
    assert.equal(step.rest.length, 0);
  });

  it('round-trips a real NATIVE request envelope', () => {
    // The native daemon envelope: string id, snake_case method, payload, ts.
    const envelope = makeRequestEnvelope(
      'gov-7',
      'decide',
      { action: 'file_write', target: 'src/x.ts', key: 'k' },
      1234,
    );
    const frame = encodeFrame(envelope);
    const { value } = decodeFrame(frame);
    assert.deepEqual(value, {
      id: 'gov-7',
      method: 'decide',
      payload: { action: 'file_write', target: 'src/x.ts', key: 'k' },
      ts: 1234,
    });
  });

  it('returns value:null when the buffer holds only a partial length prefix', () => {
    const step = decodeFrame(Buffer.from([0x00, 0x00])); // 2 of 4 prefix bytes
    assert.equal(step.value, null);
    assert.equal(step.rest.length, 2);
  });

  it('returns value:null when the payload has not fully arrived', () => {
    const frame = encodeFrame({ hello: 'world' });
    const partial = frame.subarray(0, frame.length - 1); // drop last payload byte
    const step = decodeFrame(partial);
    assert.equal(step.value, null);
    assert.equal(step.rest.length, partial.length);
  });

  it('leaves trailing bytes of a second frame untouched (rest)', () => {
    const a = encodeFrame({ n: 1 });
    const b = encodeFrame({ n: 2 });
    const combined = Buffer.concat([a, b]);
    const step = decodeFrame(combined);
    assert.deepEqual(step.value, { n: 1 });
    // rest must be exactly the second frame, byte-for-byte.
    assert.deepEqual([...step.rest], [...b]);
  });

  it('rejects a hostile oversized length prefix BEFORE allocating', () => {
    const hostile = Buffer.alloc(LENGTH_PREFIX_BYTES);
    hostile.writeUInt32BE(MAX_FRAME_BYTES + 1, 0);
    assert.throws(() => decodeFrame(hostile), FrameError);
  });

  it('rejects a payload that is not valid JSON', () => {
    const badPayload = Buffer.from('{not json', 'utf8');
    const frame = Buffer.allocUnsafe(LENGTH_PREFIX_BYTES + badPayload.length);
    frame.writeUInt32BE(badPayload.length, 0);
    badPayload.copy(frame, LENGTH_PREFIX_BYTES);
    assert.throws(() => decodeFrame(frame), FrameError);
  });

  it('refuses to encode an undefined-serializing value', () => {
    assert.throws(() => encodeFrame(undefined), FrameError);
  });
});

describe('ipc codec — FrameDecoder streaming accumulator', () => {
  it('drains multiple complete frames from one chunk in order', () => {
    const dec = new FrameDecoder();
    const chunk = Buffer.concat([encodeFrame({ n: 1 }), encodeFrame({ n: 2 }), encodeFrame({ n: 3 })]);
    const out = dec.push(chunk);
    assert.deepEqual(out, [{ n: 1 }, { n: 2 }, { n: 3 }]);
    assert.equal(dec.pending(), 0);
  });

  it('reassembles a frame split across two chunks', () => {
    const dec = new FrameDecoder();
    const frame = encodeFrame({ message: 'split across chunks' });
    const mid = Math.floor(frame.length / 2);
    assert.deepEqual(dec.push(frame.subarray(0, mid)), []); // incomplete
    assert.deepEqual(dec.push(frame.subarray(mid)), [{ message: 'split across chunks' }]);
    assert.equal(dec.pending(), 0);
  });

  it('reassembles a length prefix split byte-by-byte', () => {
    const dec = new FrameDecoder();
    const frame = encodeFrame({ ok: true });
    for (let i = 0; i < frame.length - 1; i++) {
      assert.deepEqual(dec.push(frame.subarray(i, i + 1)), []);
    }
    assert.deepEqual(dec.push(frame.subarray(frame.length - 1)), [{ ok: true }]);
  });

  it('throws on a framing violation in the stream (hostile length)', () => {
    const dec = new FrameDecoder();
    const hostile = Buffer.alloc(LENGTH_PREFIX_BYTES);
    hostile.writeUInt32BE(MAX_FRAME_BYTES + 1, 0);
    assert.throws(() => dec.push(hostile), FrameError);
  });
});

describe('ipc envelope — hostile NATIVE response validation', () => {
  it('accepts a well-formed ok response (string id, result)', () => {
    const env = parseResponseEnvelope({
      id: 'gov-1',
      ok: true,
      result: { effect: 'allow' },
    });
    assert.ok(env);
    assert.equal(env?.ok, true);
    assert.equal(env?.id, 'gov-1');
  });

  it('accepts a well-formed error response (string error)', () => {
    const env = parseResponseEnvelope({
      id: 'gov-2',
      ok: false,
      error: 'bad_request: malformed payload',
    });
    assert.ok(env);
    assert.equal(env?.ok, false);
    if (env && env.ok === false) {
      assert.equal(env.error, 'bad_request: malformed payload');
    }
  });

  it('accepts ok:true with a null result (the daemon may send result:null)', () => {
    const env = parseResponseEnvelope({ id: 'gov-3', ok: true, result: null });
    assert.ok(env);
    assert.equal(env?.ok, true);
  });

  it('rejects a non-string / empty id (never trust the wire)', () => {
    assert.equal(parseResponseEnvelope({ id: 7, ok: true, result: {} }), null);
    assert.equal(parseResponseEnvelope({ id: '', ok: true, result: {} }), null);
  });

  it('rejects a missing id', () => {
    assert.equal(parseResponseEnvelope({ ok: true, result: {} }), null);
  });

  it('rejects a non-boolean ok', () => {
    assert.equal(parseResponseEnvelope({ id: 'gov-1', ok: 'yes', result: {} }), null);
  });

  it('rejects an ok:true response missing result', () => {
    assert.equal(parseResponseEnvelope({ id: 'gov-1', ok: true }), null);
  });

  it('rejects an ok:false response with a non-string error', () => {
    assert.equal(parseResponseEnvelope({ id: 'gov-1', ok: false, error: { code: 1 } }), null);
  });

  it('rejects an ok:false response with an empty error string', () => {
    assert.equal(parseResponseEnvelope({ id: 'gov-1', ok: false, error: '' }), null);
  });

  it('rejects non-object / null payloads', () => {
    assert.equal(parseResponseEnvelope(null), null);
    assert.equal(parseResponseEnvelope('nope'), null);
    assert.equal(parseResponseEnvelope(42), null);
  });
});
