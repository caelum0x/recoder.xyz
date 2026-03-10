"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersistentCollaborationService = exports.PersistentAuditLogService = exports.PersistentTaskStore = exports.DEFAULT_A2A_PERSISTENCE_KEYS = exports.DEFAULT_A2A_COLLABORATION_KEY = exports.DEFAULT_A2A_AUDIT_LOG_KEY = exports.DEFAULT_A2A_TASK_STORE_KEY = exports.BrowserStoragePersistenceAdapter = exports.InMemoryPersistenceAdapter = void 0;
class InMemoryPersistenceAdapter {
    store = new Map();
    read(key) {
        return this.store.get(key) ?? null;
    }
    write(key, value) {
        this.store.set(key, value);
    }
}
exports.InMemoryPersistenceAdapter = InMemoryPersistenceAdapter;
class BrowserStoragePersistenceAdapter {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    read(key) {
        return this.storage.getItem(key);
    }
    write(key, value) {
        this.storage.setItem(key, value);
    }
}
exports.BrowserStoragePersistenceAdapter = BrowserStoragePersistenceAdapter;
function safeParseJson(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
exports.DEFAULT_A2A_TASK_STORE_KEY = 'a2a.task-store.v1';
exports.DEFAULT_A2A_AUDIT_LOG_KEY = 'a2a.audit-log.v1';
exports.DEFAULT_A2A_COLLABORATION_KEY = 'a2a.collaboration.v1';
exports.DEFAULT_A2A_PERSISTENCE_KEYS = [
    exports.DEFAULT_A2A_TASK_STORE_KEY,
    exports.DEFAULT_A2A_AUDIT_LOG_KEY,
    exports.DEFAULT_A2A_COLLABORATION_KEY,
];
class PersistentTaskStore {
    adapter;
    key;
    tasks = new Map();
    events = new Map();
    constructor(adapter, key = exports.DEFAULT_A2A_TASK_STORE_KEY) {
        this.adapter = adapter;
        this.key = key;
        const snapshot = safeParseJson(this.adapter.read(this.key), {
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
    create(task) {
        this.tasks.set(task.id, task);
        this.persist();
        return task;
    }
    get(taskId) {
        return this.tasks.get(taskId);
    }
    update(taskId, patch) {
        const existing = this.tasks.get(taskId);
        if (!existing) {
            throw new Error(`Task not found: ${taskId}`);
        }
        const next = {
            ...existing,
            ...patch,
            updatedAt: patch.updatedAt ?? new Date().toISOString(),
        };
        this.tasks.set(taskId, next);
        this.persist();
        return next;
    }
    listByThread(threadId) {
        return [...this.tasks.values()].filter((task) => task.threadId === threadId);
    }
    appendEvent(event) {
        const list = this.events.get(event.taskId) ?? [];
        list.push(event);
        this.events.set(event.taskId, list);
        this.persist();
    }
    getEvents(taskId) {
        return [...(this.events.get(taskId) ?? [])];
    }
    persist() {
        const events = [...this.events.values()].flat();
        const snapshot = {
            tasks: [...this.tasks.values()],
            events,
        };
        this.adapter.write(this.key, JSON.stringify(snapshot));
    }
}
exports.PersistentTaskStore = PersistentTaskStore;
class PersistentAuditLogService {
    adapter;
    key;
    entries;
    constructor(adapter, key = exports.DEFAULT_A2A_AUDIT_LOG_KEY) {
        this.adapter = adapter;
        this.key = key;
        this.entries = safeParseJson(this.adapter.read(this.key), []);
    }
    append(entry) {
        this.entries.push(entry);
        this.persist();
    }
    list() {
        return [...this.entries];
    }
    listByTask(taskId) {
        return this.entries.filter((entry) => entry.taskId === taskId);
    }
    listByConnector(connectorId) {
        return this.entries.filter((entry) => entry.connectorId === connectorId);
    }
    persist() {
        this.adapter.write(this.key, JSON.stringify(this.entries));
    }
}
exports.PersistentAuditLogService = PersistentAuditLogService;
class PersistentCollaborationService {
    adapter;
    key;
    channels = new Map();
    threads = new Map();
    messages = new Map();
    constructor(adapter, key = exports.DEFAULT_A2A_COLLABORATION_KEY) {
        this.adapter = adapter;
        this.key = key;
        const snapshot = safeParseJson(this.adapter.read(this.key), {
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
    createChannel(input) {
        const channel = {
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
    createThread(input) {
        const channel = this.channels.get(input.channelId);
        if (!channel)
            throw new Error(`Channel not found: ${input.channelId}`);
        const thread = {
            id: input.id,
            channelId: input.channelId,
            title: input.title,
            createdAt: new Date().toISOString(),
        };
        this.threads.set(thread.id, thread);
        this.persist();
        return thread;
    }
    sendMessage(input) {
        const thread = this.threads.get(input.threadId);
        if (!thread)
            throw new Error(`Thread not found: ${input.threadId}`);
        const channel = this.channels.get(thread.channelId);
        if (!channel)
            throw new Error(`Channel not found: ${thread.channelId}`);
        if (!channel.memberAgentIds.includes(input.senderAgentId)) {
            throw new Error(`Sender ${input.senderAgentId} is not a member of channel ${thread.channelId}`);
        }
        const message = {
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
    listChannels() {
        return [...this.channels.values()];
    }
    listThreads(channelId) {
        return [...this.threads.values()].filter((thread) => thread.channelId === channelId);
    }
    listMessages(threadId) {
        return [...(this.messages.get(threadId) ?? [])];
    }
    persist() {
        const snapshot = {
            channels: [...this.channels.values()],
            threads: [...this.threads.values()],
            messages: [...this.messages.values()].flat(),
        };
        this.adapter.write(this.key, JSON.stringify(snapshot));
    }
}
exports.PersistentCollaborationService = PersistentCollaborationService;
