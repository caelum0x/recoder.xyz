import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const daytonaAdapterProfile = createOssAdapterProfile({
  adapterId: 'daytona-sandbox',
  provider: 'daytona',
  kind: 'sandbox',
  displayName: 'Daytona Sandbox',
  supportedTaskIntents: ['bugfix', 'feature_delivery', 'verification', 'migration', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapDaytonaTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(daytonaAdapterProfile, input);
}
