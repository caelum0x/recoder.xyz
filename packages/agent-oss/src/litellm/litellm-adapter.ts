import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const liteLlmAdapterProfile = createOssAdapterProfile({
  adapterId: 'litellm-router',
  provider: 'litellm',
  kind: 'llm_router',
  displayName: 'LiteLLM Router',
  supportedTaskIntents: ['research', 'documentation', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapLiteLlmTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(liteLlmAdapterProfile, input);
}
