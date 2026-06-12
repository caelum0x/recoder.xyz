export const RECODER_AGENT_EVENT_TYPES = [
  'recoder.agent.connected',
  'recoder.agent.disconnected',
  'recoder.agent.capabilities.updated',
  'recoder.task.created',
  'recoder.task.compiled',
  'recoder.task.claimed',
  'recoder.run.started',
  'recoder.run.log.appended',
  'recoder.artifact.created',
  'recoder.approval.requested',
  'recoder.approval.approved',
  'recoder.approval.rejected',
  'recoder.verification.started',
  'recoder.verification.completed',
  'recoder.runtime_evidence.created',
  'recoder.work_signal.opened',
  'recoder.work_signal.resolved',
  'recoder.memory.candidate.created',
  'recoder.memory.accepted',
  'recoder.run.completed',
  'recoder.run.failed',
] as const;

export const RECORDER_AGENT_EVENT_TYPES = RECODER_AGENT_EVENT_TYPES;

export type RecoderAgentEventType = typeof RECODER_AGENT_EVENT_TYPES[number];
