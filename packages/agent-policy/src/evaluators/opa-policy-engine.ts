import type {
  PolicyDecision,
  PolicyDecisionEffect,
  PolicyEnginePort,
  PolicyEvaluationRequest,
} from '@recoder/agent-os';

export type OpaPolicyEngineOptions = {
  endpoint: string;
  fetchImpl?: typeof fetch;
};

const VALID_EFFECTS: ReadonlySet<PolicyDecisionEffect> = new Set([
  'allow',
  'deny',
  'needs_approval',
]);

export class OpaPolicyEngine implements PolicyEnginePort {
  constructor(private readonly options: OpaPolicyEngineOptions) {}

  async evaluate(input: PolicyEvaluationRequest): Promise<PolicyDecision> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(this.options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input }),
    });
    if (!response.ok) {
      throw new Error(`OPA policy request failed: ${response.status}`);
    }
    const body: unknown = await response.json();
    // OPA wraps rule results as `{ "result": {...} }` and returns `{}` when no
    // rule fires. Unwrap the envelope, then fail closed if the decision does not
    // carry a valid effect instead of silently trusting the raw response.
    return validatePolicyDecision(unwrapOpaResult(body));
  }
}

function unwrapOpaResult(body: unknown): unknown {
  if (body !== null && typeof body === 'object' && 'result' in body) {
    return (body as { result: unknown }).result;
  }
  return body;
}

function validatePolicyDecision(value: unknown): PolicyDecision {
  if (value === null || typeof value !== 'object') {
    throw new Error('OPA policy response is not a decision object');
  }
  const effect = (value as Record<string, unknown>).effect;
  if (typeof effect !== 'string' || !VALID_EFFECTS.has(effect as PolicyDecisionEffect)) {
    throw new Error(`OPA policy response has invalid or missing effect: ${String(effect)}`);
  }
  return value as PolicyDecision;
}
