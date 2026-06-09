import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const openGrokAdapterProfile = createOssAdapterProfile({
  adapterId: 'opengrok-code-search',
  provider: 'opengrok',
  kind: 'code_search',
  displayName: 'OpenGrok Code Search',
  supportedTaskIntents: ['research', 'code_review', 'refactor', 'migration', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapOpenGrokTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(openGrokAdapterProfile, input);
}
