import type { RunEvent } from '@recoder/agent-os';
import { createRecoderCloudEvent } from './cloudevent';
import type { RecoderAgentEventType } from './event-types';

export function mapRunEventToCloudEvent(event: RunEvent) {
  const type: RecoderAgentEventType =
    event.type === 'started'
      ? 'recoder.run.started'
      : event.type === 'completed'
        ? 'recoder.run.completed'
        : event.type === 'failed'
          ? 'recoder.run.failed'
          : event.type === 'artifact'
            ? 'recoder.artifact.created'
            : event.type === 'verified'
              ? 'recoder.verification.completed'
              : event.type === 'approval_requested'
                ? 'recoder.approval.requested'
                : 'recoder.run.log.appended';

  return createRecoderCloudEvent({
    id: event.eventId,
    type,
    source: `recoder://task/${event.taskId}`,
    subject: event.runId ?? event.taskId,
    time: event.createdAt,
    data: event,
  });
}
