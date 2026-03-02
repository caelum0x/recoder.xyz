import {
  parsePublicTaskStreamEvent,
  parsePublicTaskStreamFrame,
  type PublicTaskStreamEvent,
  type PublicTaskStreamFrame,
} from '@recoder/stream/public-task-stream';

export type {
  PublicPromptTaskStatus,
  PublicPromptTaskSnapshot,
  PublicTaskStreamData,
  PublicTaskStreamEvent,
  PublicTaskStreamFrame,
} from '@recoder/stream/public-task-stream';

export function parseTaskStreamEvent(raw: string): PublicTaskStreamEvent {
  return parsePublicTaskStreamEvent(raw);
}

export function parseTaskStreamFrame(raw: string): PublicTaskStreamFrame {
  return parsePublicTaskStreamFrame(raw);
}
