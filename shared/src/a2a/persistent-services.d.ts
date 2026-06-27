import type { A2ATask, AuditEntry, AuditLogService, CollaborationChannel, CollaborationMessage, CollaborationScope, CollaborationService, CollaborationThread, TaskEvent, TaskStore } from './control-plane';
export interface A2APersistenceAdapter {
    read(key: string): string | null;
    write(key: string, value: string): void;
}
export declare class InMemoryPersistenceAdapter implements A2APersistenceAdapter {
    private readonly store;
    read(key: string): string | null;
    write(key: string, value: string): void;
}
export declare class BrowserStoragePersistenceAdapter implements A2APersistenceAdapter {
    private readonly storage;
    constructor(storage: Storage);
    read(key: string): string | null;
    write(key: string, value: string): void;
}
export declare const DEFAULT_A2A_TASK_STORE_KEY = "a2a.task-store.v1";
export declare const DEFAULT_A2A_AUDIT_LOG_KEY = "a2a.audit-log.v1";
export declare const DEFAULT_A2A_COLLABORATION_KEY = "a2a.collaboration.v1";
export declare const DEFAULT_A2A_PERSISTENCE_KEYS: readonly ["a2a.task-store.v1", "a2a.audit-log.v1", "a2a.collaboration.v1"];
export declare class PersistentTaskStore implements TaskStore {
    private readonly adapter;
    private readonly key;
    private readonly tasks;
    private readonly events;
    constructor(adapter: A2APersistenceAdapter, key?: string);
    create(task: A2ATask): A2ATask;
    get(taskId: string): A2ATask | undefined;
    update(taskId: string, patch: Partial<A2ATask>): A2ATask;
    listByThread(threadId: string): A2ATask[];
    appendEvent(event: TaskEvent): void;
    getEvents(taskId: string): TaskEvent[];
    private persist;
}
export declare class PersistentAuditLogService implements AuditLogService {
    private readonly adapter;
    private readonly key;
    private readonly entries;
    constructor(adapter: A2APersistenceAdapter, key?: string);
    append(entry: AuditEntry): void;
    list(): AuditEntry[];
    listByTask(taskId: string): AuditEntry[];
    listByConnector(connectorId: string): AuditEntry[];
    private persist;
}
export declare class PersistentCollaborationService implements CollaborationService {
    private readonly adapter;
    private readonly key;
    private readonly channels;
    private readonly threads;
    private readonly messages;
    constructor(adapter: A2APersistenceAdapter, key?: string);
    createChannel(input: {
        id: string;
        scope: CollaborationScope;
        name: string;
        memberAgentIds: string[];
    }): CollaborationChannel;
    createThread(input: {
        id: string;
        channelId: string;
        title: string;
    }): CollaborationThread;
    sendMessage(input: {
        id: string;
        threadId: string;
        senderAgentId: string;
        text: string;
    }): CollaborationMessage;
    listChannels(): CollaborationChannel[];
    listThreads(channelId: string): CollaborationThread[];
    listMessages(threadId: string): CollaborationMessage[];
    private persist;
}
