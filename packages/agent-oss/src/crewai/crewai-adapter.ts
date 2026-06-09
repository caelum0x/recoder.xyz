import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const crewAiAdapterProfile = createOssAdapterProfile({
  adapterId: 'crewai',
  provider: 'crewai',
  kind: 'agent_framework',
  displayName: 'CrewAI Runner',
  supportedTaskIntents: ['research', 'documentation', 'handoff', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapCrewAiTask(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(crewAiAdapterProfile, input);
}
