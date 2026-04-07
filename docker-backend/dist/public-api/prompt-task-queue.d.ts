export interface ClaimedPromptTask {
    taskId: string;
    attempt: number;
    runAt: number;
    lastError: string | null;
}
export interface DeadLetterEntry {
    taskId: string;
    attempts: number;
    lastError: string | null;
    failedAt: number;
}
export interface PromptTaskQueue {
    enqueue(taskId: string, options?: {
        runAt?: number;
        attempt?: number;
        lastError?: string | null;
    }): Promise<void>;
    claimDue(now: number, limit: number, leaseMs: number): Promise<ClaimedPromptTask[]>;
    ack(taskId: string): Promise<void>;
    reschedule(taskId: string, options: {
        runAt: number;
        attempt: number;
        lastError?: string | null;
    }): Promise<void>;
    cancel(taskId: string): Promise<void>;
    clearAll(): Promise<void>;
    /** Move a permanently failed task to the dead-letter store. */
    deadLetter(taskId: string, options: {
        attempts: number;
        lastError: string | null;
    }): Promise<void>;
    /** List dead-letter entries (most recent first). */
    listDeadLetters(limit?: number): Promise<DeadLetterEntry[]>;
    /** Release zombie locks older than the given threshold. Returns number of released tasks. */
    releaseZombieLocks(now: number, maxLockAgeMs: number): Promise<number>;
}
export declare class PromptTaskQueueStore implements PromptTaskQueue {
    private readonly db;
    constructor(dbPath: string);
    enqueue(taskId: string, options?: {
        runAt?: number;
        attempt?: number;
        lastError?: string | null;
    }): Promise<void>;
    claimDue(now: number, limit: number, leaseMs: number): Promise<ClaimedPromptTask[]>;
    ack(taskId: string): Promise<void>;
    reschedule(taskId: string, options: {
        runAt: number;
        attempt: number;
        lastError?: string | null;
    }): Promise<void>;
    cancel(taskId: string): Promise<void>;
    clearAll(): Promise<void>;
    deadLetter(taskId: string, options: {
        attempts: number;
        lastError: string | null;
    }): Promise<void>;
    listDeadLetters(limit?: number): Promise<DeadLetterEntry[]>;
    releaseZombieLocks(now: number, maxLockAgeMs: number): Promise<number>;
}
export declare const promptTaskQueue: PromptTaskQueue;
