import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const stagehandAdapterProfile = createOssAdapterProfile({
  adapterId: 'stagehand',
  provider: 'stagehand',
  kind: 'browser_automation',
  displayName: 'Stagehand Browser Adapter',
  supportedTaskIntents: ['verification', 'research', 'feature_delivery', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapStagehandTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(stagehandAdapterProfile, input);
}
