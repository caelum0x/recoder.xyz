import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const e2bAdapterProfile = createOssAdapterProfile({
  adapterId: 'e2b-sandbox',
  provider: 'e2b',
  kind: 'sandbox',
  displayName: 'E2B Sandbox',
  supportedTaskIntents: ['verification', 'test_generation', 'research', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapE2bTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(e2bAdapterProfile, input);
}
