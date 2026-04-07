export type { PublicPromptTaskStatus, PublicPromptTaskSnapshot, PublicTaskStreamData, PublicTaskStreamEvent, } from '@giselles-ai/stream/public-task-stream';
import type { PublicTaskStreamEvent } from '@giselles-ai/stream/public-task-stream';
export declare function serializeTaskStreamEvent(event: PublicTaskStreamEvent, options?: {
    id?: string;
    event?: string;
    retry?: number;
}): string;
