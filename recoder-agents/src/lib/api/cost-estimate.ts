import { resolveBrowserBackendApiUrl } from '@/lib/runtime-urls';

export interface CostEstimate {
  model: string;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
  pricing_available: boolean;
}

export async function getCostEstimate(
  agentId: string,
  promptLength: number,
  model: string,
): Promise<CostEstimate> {
  const url = `${resolveBrowserBackendApiUrl()}/agents/${agentId}/cost-estimate?prompt_length=${promptLength}&model=${encodeURIComponent(model)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cost estimate failed: ${res.status}`);
  return res.json();
}
