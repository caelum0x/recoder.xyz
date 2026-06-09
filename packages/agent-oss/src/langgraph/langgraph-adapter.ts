import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const langGraphAdapterProfile = createOssAdapterProfile({
  adapterId: 'langgraph',
  provider: 'langgraph',
  kind: 'agent_framework',
  displayName: 'LangGraph Runner',
  supportedTaskIntents: ['research', 'documentation', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapLangGraphTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(langGraphAdapterProfile, input);
}
