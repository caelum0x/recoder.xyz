import type { PolicyDecision, PolicyEnginePort, PolicyEvaluationRequest } from '@recoder/agent-os';

export type OpaPolicyEngineOptions = {
  endpoint: string;
  fetchImpl?: typeof fetch;
};

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
    return (await response.json()) as PolicyDecision;
  }
}
