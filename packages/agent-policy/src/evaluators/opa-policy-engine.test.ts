import { describe, expect, it } from 'vitest';
import { OpaPolicyEngine } from './opa-policy-engine.js';
import type { PolicyEvaluationRequest } from '@recoder/agent-os';

const request = {} as unknown as PolicyEvaluationRequest;

function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return (async () =>
    ({
      ok,
      status,
      json: async () => body,
    }) as unknown as Response) as unknown as typeof fetch;
}

describe('OpaPolicyEngine', () => {
  it('unwraps the OPA .result envelope and returns the decision', async () => {
    const engine = new OpaPolicyEngine({
      endpoint: 'http://opa/v1/data/recoder/allow',
      fetchImpl: fakeFetch({
        result: {
          decisionId: 'd1',
          effect: 'deny',
          action: 'file.write',
          actorAgentId: 'a1',
          reason: 'blocked',
          createdAt: '2026-07-31T00:00:00.000Z',
        },
      }),
    });
    const result = await engine.evaluate(request);
    expect(result.effect).toBe('deny');
  });

  it('throws (fail-closed) when OPA returns {} (no rule fired)', async () => {
    const engine = new OpaPolicyEngine({
      endpoint: 'http://opa',
      fetchImpl: fakeFetch({}),
    });
    await expect(engine.evaluate(request)).rejects.toThrow();
  });

  it('throws (fail-closed) when result has an invalid effect', async () => {
    const engine = new OpaPolicyEngine({
      endpoint: 'http://opa',
      fetchImpl: fakeFetch({ result: { effect: 'maybe' } }),
    });
    await expect(engine.evaluate(request)).rejects.toThrow();
  });

  it('throws (fail-closed) when body is missing effect entirely', async () => {
    const engine = new OpaPolicyEngine({
      endpoint: 'http://opa',
      fetchImpl: fakeFetch({ result: { reason: 'no effect field' } }),
    });
    await expect(engine.evaluate(request)).rejects.toThrow();
  });

  it('throws (fail-closed) when body is not an object', async () => {
    const engine = new OpaPolicyEngine({
      endpoint: 'http://opa',
      fetchImpl: fakeFetch('not-json-object'),
    });
    await expect(engine.evaluate(request)).rejects.toThrow();
  });

  it('throws on non-ok HTTP response', async () => {
    const engine = new OpaPolicyEngine({
      endpoint: 'http://opa',
      fetchImpl: fakeFetch({}, false, 500),
    });
    await expect(engine.evaluate(request)).rejects.toThrow();
  });
});
