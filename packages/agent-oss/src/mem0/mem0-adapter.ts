import { createOssAdapterProfile, mapTaskForOssRuntime, type OssAdapterRunInput } from '../adapter-boundary';

export const mem0AdapterProfile = createOssAdapterProfile({
  adapterId: 'mem0',
  provider: 'mem0',
  kind: 'memory_provider',
  displayName: 'mem0 Memory Adapter',
  supportedTaskIntents: ['research', 'documentation', 'custom'],
  emitsRunEvents: true,
  requiresPolicyDecision: true,
});

export function mapMem0Task(input: OssAdapterRunInput) {
  return mapTaskForOssRuntime(mem0AdapterProfile, input);
}
