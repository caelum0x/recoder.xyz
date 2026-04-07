export type PublicPromptTaskStatus = 'queued' | 'running' | 'completed' | 'failed';
export interface PublicPromptTaskSnapshot {
    id: string;
    projectId: string;
    status: PublicPromptTaskStatus;
    model?: string;
    result?: string;
    error?: string;
    createdAt: number;
    updatedAt: number;
}
export interface PublicTaskStreamData {
    task: PublicPromptTaskSnapshot;
}
export type PublicTaskStreamEvent = {
    type: 'connected';
    taskId: string;
    status: PublicPromptTaskStatus;
} | {
    type: 'data';
    data: PublicTaskStreamData;
} | {
    type: 'heartbeat';
    at: number;
} | {
    type: 'end';
    status: PublicPromptTaskStatus;
} | {
    type: 'error';
    message: string;
};
export declare function serializePublicTaskStreamEvent(event: PublicTaskStreamEvent, options?: {
    id?: string;
    event?: string;
    retry?: number;
}): string;
