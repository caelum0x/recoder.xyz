import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const openZitiAdapterProfile = createOssAdapterProfile({
  adapterId: 'openziti',
  provider: 'openziti',
  kind: 'private_network',
  displayName: 'OpenZiti Private Network',
  supportedTaskIntents: ['platform_hardening', 'release', 'incident_response', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapOpenZitiTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(openZitiAdapterProfile, input);
}
