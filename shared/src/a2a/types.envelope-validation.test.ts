import { describe, expect, it } from 'vitest';
import {
  validateRecoderA2AEnvelope,
  isRecoderA2AEnvelope,
  assertRecoderA2AEnvelope,
  parseRecoderA2AEnvelope,
  RecoderA2AEnvelopeValidationError,
  RECODER_A2A_ENVELOPE_VERSION,
  RECODER_A2A_PROTOCOL_VERSION,
  type RecoderA2AEnvelope,
  type RecoderA2AEnvelopeInput,
  type RecoderPayloadInput,
} from './types';
// The Zod schemas are imported from their defining module. They are *also*
// re-exported from `./types` (and `./schemas`) for consumers; that re-export is
// verified through the shipped CJS `require()` smoke, not here -- Vite's SSR
// transform does not surface star-style `export { X } from` live bindings as
// readable namespace properties, so reading them through `./types` under vitest
// is a transform artifact, not a runtime defect.
import {
  RecoderA2AEnvelopeSchema,
  RecoderPayloadSchema,
} from './schemas/recoder-envelope';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function validEnvelope(): RecoderA2AEnvelope {
  return {
    envelopeVersion: RECODER_A2A_ENVELOPE_VERSION,
    protocolVersion: RECODER_A2A_PROTOCOL_VERSION,
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
// Backward-compatible API surface
// ---------------------------------------------------------------------------

describe('validateRecoderA2AEnvelope (Zod-backed, backward compatible)', () => {
  it('returns an empty issue list for a valid envelope', () => {
    expect(validateRecoderA2AEnvelope(validEnvelope())).toEqual([]);
  });

  it('returns a single "$" issue when the value is not an object', () => {
    for (const bad of [null, undefined, 'str', 42, true, [1, 2]]) {
      const issues = validateRecoderA2AEnvelope(bad);
      expect(issues).toEqual([{ path: '$', message: 'envelope must be an object' }]);
    }
  });

  it('reports missing top-level fields by name', () => {
    const issues = validateRecoderA2AEnvelope({});
    const paths = issues.map((i) => i.path);
    expect(paths).toContain('envelopeVersion');
    expect(paths).toContain('protocolVersion');
    expect(paths).toContain('messageId');
    expect(paths).toContain('threadId');
    expect(paths).toContain('createdAt');
    expect(paths).toContain('from');
    expect(paths).toContain('to');
    expect(paths).toContain('intent');
    expect(paths).toContain('payload');
  });

  it('uses dotted paths for nested identity fields', () => {
    const env = validEnvelope();
    const issues = validateRecoderA2AEnvelope({ ...env, from: { name: 'x', platform: 'codex' } });
    expect(issues.some((i) => i.path === 'from.id')).toBe(true);
  });

  it('uses bracket+dot paths for payload parts', () => {
    const env = validEnvelope();
    const issues = validateRecoderA2AEnvelope({
      ...env,
      payload: [{ kind: 'text', text: '   ' }],
    });
    expect(issues.some((i) => i.path === 'payload[0].text')).toBe(true);
  });

  it('rejects an unknown intent (closed set, same as legacy)', () => {
    const env = validEnvelope();
    const issues = validateRecoderA2AEnvelope({ ...env, intent: 'not-a-real-intent' });
    expect(issues.some((i) => i.path === 'intent')).toBe(true);
  });

  it('rejects an unknown platform (closed set)', () => {
    const env = validEnvelope();
    const issues = validateRecoderA2AEnvelope({
      ...env,
      to: { id: 'a2', name: 'A', platform: 'totally_fake' },
    });
    expect(issues.some((i) => i.path === 'to.platform')).toBe(true);
  });

  it('rejects a non-ISO createdAt', () => {
    const env = validEnvelope();
    const issues = validateRecoderA2AEnvelope({ ...env, createdAt: 'not-a-date' });
    expect(issues.some((i) => i.path === 'createdAt')).toBe(true);
  });

  it('accepts optional metadata + trace when well-formed', () => {
    const env = validEnvelope();
    expect(
      validateRecoderA2AEnvelope({
        ...env,
        metadata: { k: 'v' },
        trace: { traceId: 't-1', parentMessageId: 'm-0' },
      })
    ).toEqual([]);
  });

  it('rejects a malformed trace', () => {
    const env = validEnvelope();
    const issues = validateRecoderA2AEnvelope({ ...env, trace: { traceId: '' } });
    expect(issues.some((i) => i.path === 'trace.traceId')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// strictVersion option (preserved)
// ---------------------------------------------------------------------------

describe('strictVersion option', () => {
  it('accepts any non-empty version when not strict', () => {
    const env = validEnvelope();
    expect(
      validateRecoderA2AEnvelope({ ...env, envelopeVersion: '9.9.9', protocolVersion: 'x' })
    ).toEqual([]);
  });

  it('pins versions to canonical constants when strict', () => {
    const env = validEnvelope();
    const issues = validateRecoderA2AEnvelope(
      { ...env, envelopeVersion: '9.9.9' },
      { strictVersion: true }
    );
    expect(issues.some((i) => i.path === 'envelopeVersion')).toBe(true);
  });

  it('passes strict validation with canonical versions', () => {
    expect(validateRecoderA2AEnvelope(validEnvelope(), { strictVersion: true })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tightened payload union (the new hardening)
// ---------------------------------------------------------------------------

describe('tightened payload union', () => {
  it('rejects payload parts with an unknown kind (previously slipped through unknown[])', () => {
    const env = validEnvelope();
    const issues = validateRecoderA2AEnvelope({
      ...env,
      payload: [{ kind: 'mystery', text: 'x' } as unknown],
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.path.startsWith('payload'))).toBe(true);
  });

  it('rejects arbitrary non-payload objects in the payload array', () => {
    const env = validEnvelope();
    const issues = validateRecoderA2AEnvelope({
      ...env,
      payload: [{ foo: 'bar' } as unknown],
    });
    expect(issues.length).toBeGreaterThan(0);
  });

  it('rejects an artifact with an out-of-set artifactType', () => {
    const env = validEnvelope();
    const issues = validateRecoderA2AEnvelope({
      ...env,
      payload: [
        { kind: 'artifact', artifactType: 'zipbomb', mimeType: 'text/plain', content: 'x' } as unknown,
      ],
    });
    expect(issues.some((i) => i.path.includes('artifactType'))).toBe(true);
  });

  it('accepts every known payload variant', () => {
    const env = validEnvelope();
    expect(
      validateRecoderA2AEnvelope({
        ...env,
        payload: [
          { kind: 'text', text: 'hi' },
          { kind: 'json', data: { a: 1 } },
          { kind: 'command', command: 'ls', args: ['-la'], cwd: '/tmp' },
          { kind: 'artifact', artifactType: 'patch', mimeType: 'text/x-diff', content: '@@ -1 +1 @@' },
        ],
      })
    ).toEqual([]);
  });

  it('RecoderPayloadSchema.safeParse mirrors the union directly', () => {
    expect(RecoderPayloadSchema.safeParse({ kind: 'text', text: 'ok' }).success).toBe(true);
    expect(RecoderPayloadSchema.safeParse({ kind: 'nope' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Guards / assert / parse helpers
// ---------------------------------------------------------------------------

describe('isRecoderA2AEnvelope / assert / parse', () => {
  it('isRecoderA2AEnvelope narrows a valid value', () => {
    expect(isRecoderA2AEnvelope(validEnvelope())).toBe(true);
    expect(isRecoderA2AEnvelope({})).toBe(false);
  });

  it('assertRecoderA2AEnvelope throws a typed error with issues', () => {
    expect(() => assertRecoderA2AEnvelope({})).toThrow(RecoderA2AEnvelopeValidationError);
    try {
      assertRecoderA2AEnvelope({});
    } catch (err) {
      expect(err).toBeInstanceOf(RecoderA2AEnvelopeValidationError);
      expect((err as RecoderA2AEnvelopeValidationError).issues.length).toBeGreaterThan(0);
    }
  });

  it('parseRecoderA2AEnvelope returns the typed envelope', () => {
    const env = validEnvelope();
    const parsed = parseRecoderA2AEnvelope(env);
    expect(parsed.messageId).toBe('msg-1');
  });
});

// ---------------------------------------------------------------------------
// Exported schema + inferred type
// ---------------------------------------------------------------------------

describe('exported Zod schema + inferred types', () => {
  it('RecoderA2AEnvelopeSchema.safeParse accepts a valid envelope', () => {
    const result = RecoderA2AEnvelopeSchema.safeParse(validEnvelope());
    expect(result.success).toBe(true);
  });

  it('inferred types are usable at the type level', () => {
    // The Zod-inferred envelope type is constructible directly (intent here is a
    // member of the closed intent set, so it satisfies the narrowed inferred type).
    const env: RecoderA2AEnvelopeInput = {
      ...validEnvelope(),
      intent: 'execute',
    };
    const part: RecoderPayloadInput = { kind: 'text', text: 'do the thing' };
    expect(env.payload[0]).toEqual(part);
  });
});
