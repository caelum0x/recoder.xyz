import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const browserUseAdapterProfile = createOssAdapterProfile({
  adapterId: 'browser-use',
  provider: 'browser_use',
  kind: 'browser_automation',
  displayName: 'browser-use Adapter',
  supportedTaskIntents: ['verification', 'research', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapBrowserUseTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(browserUseAdapterProfile, input);
}
