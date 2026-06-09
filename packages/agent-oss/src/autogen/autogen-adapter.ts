import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const autogenAdapterProfile = createOssAdapterProfile({
  adapterId: 'autogen',
  provider: 'autogen',
  kind: 'agent_framework',
  displayName: 'AutoGen Runner',
  supportedTaskIntents: ['research', 'documentation', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapAutogenTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(autogenAdapterProfile, input);
}
