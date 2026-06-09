import type {
  Approval,
  Artifact,
  MemoryCandidate,
  MemoryItem,
  RuntimeEvidence,
  TaskRun,
  TaskSpec,
} from '@recoder/agent-os';
import { createRecoderCloudEvent, type RecoderCloudEvent } from './cloudevent';
import type { RecoderAgentEventType } from './event-types';

export type DomainEventInput<T> = {
  id?: string;
  source?: `recoder://${string}`;
  subject?: string;
  time?: string;
  data: T;
};

export function mapTaskCreatedToCloudEvent(
  input: DomainEventInput<TaskSpec>,
): RecoderCloudEvent<TaskSpec> {
  const task = input.data;
  return createRecoderCloudEvent({
    id: input.id ?? `evt_task_created_${task.taskId}`,
    type: 'recoder.task.created',
    source: input.source ?? `recoder://space/${task.spaceId}`,
    subject: input.subject ?? task.taskId,
    time: input.time,
    data: task,
  });
}

export function mapTaskRunStateToCloudEvent(
  input: DomainEventInput<TaskRun>,
): RecoderCloudEvent<TaskRun> {
  const run = input.data;
  return createRecoderCloudEvent({
    id: input.id ?? `evt_task_run_${run.runId}_${run.state}`,
    type: taskRunStateToEventType(run.state),
    source: input.source ?? `recoder://task/${run.taskId}`,
    subject: input.subject ?? run.runId,
    time: input.time ?? run.updatedAt,
    data: run,
  });
}

export function mapArtifactToCloudEvent(
  input: DomainEventInput<Artifact>,
): RecoderCloudEvent<Artifact> {
  const artifact = input.data;
  return createRecoderCloudEvent({
    id: input.id ?? `evt_artifact_created_${artifact.artifactId}`,
    type: 'recoder.artifact.created',
    source: input.source ?? `recoder://task/${artifact.taskId}`,
    subject: input.subject ?? artifact.runId ?? artifact.taskId,
    time: input.time ?? artifact.createdAt,
    data: artifact,
  });
}

export function mapRuntimeEvidenceToCloudEvent(
  input: DomainEventInput<RuntimeEvidence>,
): RecoderCloudEvent<RuntimeEvidence> {
  const evidence = input.data;
  return createRecoderCloudEvent({
    id: input.id ?? `evt_runtime_evidence_created_${evidence.evidenceId}`,
    type: 'recoder.runtime_evidence.created',
    source: input.source ?? `recoder://task/${evidence.taskId}`,
    subject: input.subject ?? evidence.runId ?? evidence.evidenceId,
    time: input.time ?? evidence.observedAt,
    data: evidence,
  });
}

export function mapApprovalToCloudEvent(
  input: DomainEventInput<Approval>,
): RecoderCloudEvent<Approval> {
  const approval = input.data;
  return createRecoderCloudEvent({
    id: input.id ?? `evt_approval_${approval.approvalId}_${approval.status}`,
    type: approvalStatusToEventType(approval.status),
    source: input.source ?? `recoder://task/${approval.taskId}`,
    subject: input.subject ?? approval.runId ?? approval.taskId,
    time: input.time ?? approval.decidedAt ?? approval.requestedAt,
    data: approval,
  });
}

export function mapMemoryCandidateToCloudEvent(
  input: DomainEventInput<MemoryCandidate>,
): RecoderCloudEvent<MemoryCandidate> {
  const candidate = input.data;
  return createRecoderCloudEvent({
    id: input.id ?? `evt_memory_candidate_${candidate.candidateId}_${candidate.status}`,
    type: candidate.status === 'accepted'
      ? 'recoder.memory.accepted'
      : 'recoder.memory.candidate.created',
    source: input.source ?? `recoder://task/${candidate.evidence.taskId}`,
    subject: input.subject ?? candidate.candidateId,
    time: input.time ?? candidate.reviewedAt ?? candidate.proposedAt,
    data: candidate,
  });
}

export function mapMemoryItemAcceptedToCloudEvent(
  input: DomainEventInput<MemoryItem>,
): RecoderCloudEvent<MemoryItem> {
  const memory = input.data;
  return createRecoderCloudEvent({
    id: input.id ?? `evt_memory_accepted_${memory.memoryId}`,
    type: 'recoder.memory.accepted',
    source: input.source ?? `recoder://task/${memory.evidence.taskId}`,
    subject: input.subject ?? memory.memoryId,
    time: input.time ?? memory.createdAt,
    data: memory,
  });
}

function taskRunStateToEventType(state: TaskRun['state']): RecoderAgentEventType {
  if (state === 'compiled') {
    return 'recoder.task.compiled';
  }
  if (state === 'claimed') {
    return 'recoder.task.claimed';
  }
  if (state === 'running') {
    return 'recoder.run.started';
  }
  if (state === 'verifying') {
    return 'recoder.verification.started';
  }
  if (state === 'completed') {
    return 'recoder.run.completed';
  }
  if (state === 'failed') {
    return 'recoder.run.failed';
  }
  return 'recoder.run.log.appended';
}

function approvalStatusToEventType(status: Approval['status']): RecoderAgentEventType {
  if (status === 'approved') {
    return 'recoder.approval.approved';
  }
  if (status === 'rejected') {
    return 'recoder.approval.rejected';
  }
  return 'recoder.approval.requested';
}
