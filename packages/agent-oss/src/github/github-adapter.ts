import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const githubAdapterProfile = createOssAdapterProfile({
  adapterId: 'github',
  provider: 'github',
  kind: 'deployment',
  displayName: 'GitHub PR and Repo Adapter',
  supportedTaskIntents: ['code_review', 'release', 'handoff', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapGithubTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(githubAdapterProfile, input);
}
