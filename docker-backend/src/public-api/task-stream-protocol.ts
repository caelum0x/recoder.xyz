import { serializePublicTaskStreamEvent } from '@recoder/stream/public-task-stream';

export type {
  PublicPromptTaskStatus,
  PublicPromptTaskSnapshot,
  PublicTaskStreamData,
  PublicTaskStreamEvent,
} from '@recoder/stream/public-task-stream';

import type { PublicTaskStreamEvent } from '@recoder/stream/public-task-stream';

export function serializeTaskStreamEvent(
  event: PublicTaskStreamEvent,
  options?: { id?: string; event?: string; retry?: number },
): string {
  return serializePublicTaskStreamEvent(event, options);
}
