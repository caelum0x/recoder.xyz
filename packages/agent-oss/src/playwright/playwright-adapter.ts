import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const playwrightAdapterProfile = createOssAdapterProfile({
  adapterId: 'playwright-browser',
  provider: 'playwright',
  kind: 'browser_automation',
  displayName: 'Playwright Browser Verification',
  supportedTaskIntents: ['verification', 'bugfix', 'feature_delivery', 'release'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapPlaywrightTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(playwrightAdapterProfile, input);
}
