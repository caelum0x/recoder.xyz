import type {
  Approval,
  Artifact,
  MemoryCandidate,
  MemoryItem,
  RuntimeEvidence,
  TaskRun,
  TaskSpec,
} from '@recoder/agent-os';
import type { RecoderCloudEvent } from './cloudevent';
import {
  type DomainEventInput,
  mapApprovalToCloudEvent,
  mapArtifactToCloudEvent,
  mapMemoryCandidateToCloudEvent,
  mapMemoryItemAcceptedToCloudEvent,
  mapRuntimeEvidenceToCloudEvent,
  mapTaskCreatedToCloudEvent,
  mapTaskRunStateToCloudEvent,
} from './domain-event-mapper';
import { createOutboxRecord, type OutboxRecord } from './outbox';

export type DomainOutboxStore = {
  append<T = Record<string, unknown>>(record: OutboxRecord<T>): Promise<OutboxRecord<T>> | OutboxRecord<T>;
};

export type DomainOutboxEvent =
  | { kind: 'task.created'; input: DomainEventInput<TaskSpec> }
  | { kind: 'task_run.state'; input: DomainEventInput<TaskRun> }
  | { kind: 'artifact.created'; input: DomainEventInput<Artifact> }
  | { kind: 'runtime_evidence.created'; input: DomainEventInput<RuntimeEvidence> }
  | { kind: 'approval.changed'; input: DomainEventInput<Approval> }
  | { kind: 'memory.candidate'; input: DomainEventInput<MemoryCandidate> }
  | { kind: 'memory.accepted'; input: DomainEventInput<MemoryItem> };

export class DomainEventOutboxBridge {
  constructor(private readonly store: DomainOutboxStore) {}

  append(event: DomainOutboxEvent): Promise<OutboxRecord<unknown>> {
    return this.appendCloudEvent(mapDomainOutboxEvent(event));
  }

  appendTaskCreated(input: DomainEventInput<TaskSpec>): Promise<OutboxRecord<TaskSpec>> {
    return this.appendCloudEvent(mapTaskCreatedToCloudEvent(input));
  }

  appendTaskRunState(input: DomainEventInput<TaskRun>): Promise<OutboxRecord<TaskRun>> {
    return this.appendCloudEvent(mapTaskRunStateToCloudEvent(input));
  }

  appendArtifactCreated(input: DomainEventInput<Artifact>): Promise<OutboxRecord<Artifact>> {
    return this.appendCloudEvent(mapArtifactToCloudEvent(input));
  }

  appendRuntimeEvidenceCreated(input: DomainEventInput<RuntimeEvidence>): Promise<OutboxRecord<RuntimeEvidence>> {
    return this.appendCloudEvent(mapRuntimeEvidenceToCloudEvent(input));
  }

  appendApprovalChanged(input: DomainEventInput<Approval>): Promise<OutboxRecord<Approval>> {
    return this.appendCloudEvent(mapApprovalToCloudEvent(input));
  }

  appendMemoryCandidate(input: DomainEventInput<MemoryCandidate>): Promise<OutboxRecord<MemoryCandidate>> {
    return this.appendCloudEvent(mapMemoryCandidateToCloudEvent(input));
  }

  appendMemoryAccepted(input: DomainEventInput<MemoryItem>): Promise<OutboxRecord<MemoryItem>> {
    return this.appendCloudEvent(mapMemoryItemAcceptedToCloudEvent(input));
  }

  async appendCloudEvent<T>(event: RecoderCloudEvent<T>): Promise<OutboxRecord<T>> {
    return this.store.append(createOutboxRecord(event));
  }
}

export function mapDomainOutboxEvent(event: DomainOutboxEvent): RecoderCloudEvent<unknown> {
  if (event.kind === 'task.created') {
    return mapTaskCreatedToCloudEvent(event.input);
  }
  if (event.kind === 'task_run.state') {
    return mapTaskRunStateToCloudEvent(event.input);
  }
  if (event.kind === 'artifact.created') {
    return mapArtifactToCloudEvent(event.input);
  }
  if (event.kind === 'runtime_evidence.created') {
    return mapRuntimeEvidenceToCloudEvent(event.input);
  }
  if (event.kind === 'approval.changed') {
    return mapApprovalToCloudEvent(event.input);
  }
  if (event.kind === 'memory.candidate') {
    return mapMemoryCandidateToCloudEvent(event.input);
  }
  return mapMemoryItemAcceptedToCloudEvent(event.input);
}
