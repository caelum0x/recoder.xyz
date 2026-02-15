import {
  parsePublicTaskStreamEvent,
  parsePublicTaskStreamFrame,
  type PublicTaskStreamEvent,
  type PublicTaskStreamFrame,
} from '@giselles-ai/stream/public-task-stream';

export type {
  PublicPromptTaskStatus,
  PublicPromptTaskSnapshot,
  PublicTaskStreamData,
  PublicTaskStreamEvent,
  PublicTaskStreamFrame,
} from '@giselles-ai/stream/public-task-stream';

export function parseTaskStreamEvent(raw: string): PublicTaskStreamEvent {
  return parsePublicTaskStreamEvent(raw);
}

export function parseTaskStreamFrame(raw: string): PublicTaskStreamFrame {
  return parsePublicTaskStreamFrame(raw);
}
