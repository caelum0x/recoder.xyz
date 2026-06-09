import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const sourcegraphAdapterProfile = createOssAdapterProfile({
  adapterId: 'sourcegraph-code-search',
  provider: 'sourcegraph',
  kind: 'code_search',
  displayName: 'Sourcegraph Code Search',
  supportedTaskIntents: ['research', 'code_review', 'refactor', 'migration', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapSourcegraphTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(sourcegraphAdapterProfile, input);
}
