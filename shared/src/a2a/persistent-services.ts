import type {
  A2ATask,
  AuditEntry,
  AuditLogService,
  CollaborationChannel,
  CollaborationMessage,
  CollaborationScope,
  CollaborationService,
  CollaborationThread,
  TaskEvent,
  TaskStore,
} from './control-plane';

export interface A2APersistenceAdapter {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

export class InMemoryPersistenceAdapter implements A2APersistenceAdapter {
  private readonly store = new Map<string, string>();

  read(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  write(key: string, value: string): void {
    this.store.set(key, value);
  }
}

export class BrowserStoragePersistenceAdapter implements A2APersistenceAdapter {
  constructor(private readonly storage: Storage) {}

  read(key: string): string | null {
    return this.storage.getItem(key);
  }

  write(key: string, value: string): void {
    this.storage.setItem(key, value);
  }
}

type TaskStoreSnapshot = {
  tasks: A2ATask[];
  events: TaskEvent[];
};

type CollaborationSnapshot = {
  channels: CollaborationChannel[];
  threads: CollaborationThread[];
  messages: CollaborationMessage[];
};

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const DEFAULT_A2A_TASK_STORE_KEY = 'a2a.task-store.v1';
export const DEFAULT_A2A_AUDIT_LOG_KEY = 'a2a.audit-log.v1';
export const DEFAULT_A2A_COLLABORATION_KEY = 'a2a.collaboration.v1';
export const DEFAULT_A2A_PERSISTENCE_KEYS = [
  DEFAULT_A2A_TASK_STORE_KEY,
  DEFAULT_A2A_AUDIT_LOG_KEY,
  DEFAULT_A2A_COLLABORATION_KEY,
] as const;

export class PersistentTaskStore implements TaskStore {
  private readonly tasks = new Map<string, A2ATask>();
  private readonly events = new Map<string, TaskEvent[]>();

  constructor(
    private readonly adapter: A2APersistenceAdapter,
    private readonly key = DEFAULT_A2A_TASK_STORE_KEY
  ) {
    const snapshot = safeParseJson<TaskStoreSnapshot>(this.adapter.read(this.key), {
      tasks: [],
      events: [],
    });
    for (const task of snapshot.tasks) {
      this.tasks.set(task.id, task);
    }
    for (const event of snapshot.events) {
      const list = this.events.get(event.taskId) ?? [];
      list.push(event);
      this.events.set(event.taskId, list);
    }
  }

  create(task: A2ATask): A2ATask {
    this.tasks.set(task.id, task);
    this.persist();
    return task;
  }

  get(taskId: string): A2ATask | undefined {
    return this.tasks.get(taskId);
  }

  update(taskId: string, patch: Partial<A2ATask>): A2ATask {
    const existing = this.tasks.get(taskId);
    if (!existing) {
      throw new Error(`Task not found: ${taskId}`);
    }
    const next: A2ATask = {
      ...existing,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    this.tasks.set(taskId, next);
    this.persist();
    return next;
  }

  listByThread(threadId: string): A2ATask[] {
    return [...this.tasks.values()].filter((task) => task.threadId === threadId);
  }

  appendEvent(event: TaskEvent): void {
    const list = this.events.get(event.taskId) ?? [];
    list.push(event);
    this.events.set(event.taskId, list);
    this.persist();
  }

  getEvents(taskId: string): TaskEvent[] {
    return [...(this.events.get(taskId) ?? [])];
  }

  private persist(): void {
    const events = [...this.events.values()].flat();
    const snapshot: TaskStoreSnapshot = {
      tasks: [...this.tasks.values()],
      events,
    };
    this.adapter.write(this.key, JSON.stringify(snapshot));
  }
}

export class PersistentAuditLogService implements AuditLogService {
  private readonly entries: AuditEntry[];

  constructor(
    private readonly adapter: A2APersistenceAdapter,
    private readonly key = DEFAULT_A2A_AUDIT_LOG_KEY
  ) {
    this.entries = safeParseJson<AuditEntry[]>(this.adapter.read(this.key), []);
  }

  append(entry: AuditEntry): void {
    this.entries.push(entry);
    this.persist();
  }

  list(): AuditEntry[] {
    return [...this.entries];
  }

  listByTask(taskId: string): AuditEntry[] {
    return this.entries.filter((entry) => entry.taskId === taskId);
  }

  listByConnector(connectorId: string): AuditEntry[] {
    return this.entries.filter((entry) => entry.connectorId === connectorId);
  }

  private persist(): void {
    this.adapter.write(this.key, JSON.stringify(this.entries));
  }
}

export class PersistentCollaborationService implements CollaborationService {
  private readonly channels = new Map<string, CollaborationChannel>();
  private readonly threads = new Map<string, CollaborationThread>();
  private readonly messages = new Map<string, CollaborationMessage[]>();

  constructor(
    private readonly adapter: A2APersistenceAdapter,
    private readonly key = DEFAULT_A2A_COLLABORATION_KEY
  ) {
    const snapshot = safeParseJson<CollaborationSnapshot>(this.adapter.read(this.key), {
      channels: [],
      threads: [],
      messages: [],
    });
    for (const channel of snapshot.channels) {
      this.channels.set(channel.id, channel);
    }
    for (const thread of snapshot.threads) {
      this.threads.set(thread.id, thread);
    }
    for (const message of snapshot.messages) {
      const list = this.messages.get(message.threadId) ?? [];
      list.push(message);
      this.messages.set(message.threadId, list);
    }
  }

  createChannel(input: {
    id: string;
    scope: CollaborationScope;
    name: string;
    memberAgentIds: string[];
  }): CollaborationChannel {
    const channel: CollaborationChannel = {
      id: input.id,
      scope: input.scope,
      name: input.name,
      memberAgentIds: [...input.memberAgentIds],
      createdAt: new Date().toISOString(),
    };
    this.channels.set(channel.id, channel);
    this.persist();
    return channel;
  }

  createThread(input: { id: string; channelId: string; title: string }): CollaborationThread {
    const channel = this.channels.get(input.channelId);
    if (!channel) throw new Error(`Channel not found: ${input.channelId}`);
    const thread: CollaborationThread = {
      id: input.id,
      channelId: input.channelId,
      title: input.title,
      createdAt: new Date().toISOString(),
    };
    this.threads.set(thread.id, thread);
    this.persist();
    return thread;
  }

  sendMessage(input: {
    id: string;
    threadId: string;
    senderAgentId: string;
    text: string;
  }): CollaborationMessage {
    const thread = this.threads.get(input.threadId);
    if (!thread) throw new Error(`Thread not found: ${input.threadId}`);
    const channel = this.channels.get(thread.channelId);
    if (!channel) throw new Error(`Channel not found: ${thread.channelId}`);
    if (!channel.memberAgentIds.includes(input.senderAgentId)) {
      throw new Error(`Sender ${input.senderAgentId} is not a member of channel ${thread.channelId}`);
    }

    const message: CollaborationMessage = {
      id: input.id,
      threadId: input.threadId,
      senderAgentId: input.senderAgentId,
      text: input.text,
      createdAt: new Date().toISOString(),
    };
    const list = this.messages.get(input.threadId) ?? [];
    list.push(message);
    this.messages.set(input.threadId, list);
    this.persist();
    return message;
  }

  listChannels(): CollaborationChannel[] {
    return [...this.channels.values()];
  }

  listThreads(channelId: string): CollaborationThread[] {
    return [...this.threads.values()].filter((thread) => thread.channelId === channelId);
  }

  listMessages(threadId: string): CollaborationMessage[] {
    return [...(this.messages.get(threadId) ?? [])];
  }

  private persist(): void {
    const snapshot: CollaborationSnapshot = {
      channels: [...this.channels.values()],
      threads: [...this.threads.values()],
      messages: [...this.messages.values()].flat(),
    };
    this.adapter.write(this.key, JSON.stringify(snapshot));
  }
}
