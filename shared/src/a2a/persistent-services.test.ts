import { describe, expect, it } from 'vitest';
import {
  InMemoryPersistenceAdapter,
  PersistentAuditLogService,
  PersistentCollaborationService,
  PersistentTaskStore,
} from './persistent-services';
import type { A2ATask, TaskEvent } from './control-plane';

function mkTask(id: string, threadId: string): A2ATask {
  const now = new Date().toISOString();
  return {
    id,
    threadId,
    createdAt: now,
    updatedAt: now,
    requester: { id: 'agent-a', name: 'Agent A', platform: 'codex' },
    assignee: { id: 'agent-b', name: 'Agent B', platform: 'claude_code' },
    state: 'submitted',
    prompt: 'run task',
  };
}

function mkEvent(taskId: string, kind: TaskEvent['kind']): TaskEvent {
  return {
    id: `${taskId}:${kind}`,
    taskId,
    kind,
    createdAt: new Date().toISOString(),
    details: {},
  };
}

describe('PersistentTaskStore', () => {
  it('persists tasks and events across instances', () => {
    const adapter = new InMemoryPersistenceAdapter();
    const store1 = new PersistentTaskStore(adapter);
    store1.create(mkTask('task-1', 'thread-1'));
    store1.appendEvent(mkEvent('task-1', 'task.submitted'));
    store1.update('task-1', { state: 'working' });

    const store2 = new PersistentTaskStore(adapter);
    const reloaded = store2.get('task-1');
    expect(reloaded?.state).toBe('working');
    expect(store2.getEvents('task-1')).toHaveLength(1);
    expect(store2.listByThread('thread-1')).toHaveLength(1);
  });
});

describe('PersistentAuditLogService', () => {
  it('persists audit entries across instances', () => {
    const adapter = new InMemoryPersistenceAdapter();
    const audit1 = new PersistentAuditLogService(adapter);
    audit1.append({
      id: 'entry-1',
      connectorId: 'codex-agent',
      taskId: 'task-1',
      kind: 'task.started',
      createdAt: new Date().toISOString(),
      details: {},
    });

    const audit2 = new PersistentAuditLogService(adapter);
    expect(audit2.list()).toHaveLength(1);
    expect(audit2.listByTask('task-1')).toHaveLength(1);
    expect(audit2.listByConnector('codex-agent')).toHaveLength(1);
  });
});

describe('PersistentCollaborationService', () => {
  it('persists channels, threads, and messages across instances', () => {
    const adapter = new InMemoryPersistenceAdapter();
    const c1 = new PersistentCollaborationService(adapter);
    c1.createChannel({
      id: 'ch-1',
      scope: 'channel',
      name: 'engineering',
      memberAgentIds: ['agent-a', 'agent-b'],
    });
    c1.createThread({ id: 'th-1', channelId: 'ch-1', title: 'rollout' });
    c1.sendMessage({
      id: 'msg-1',
      threadId: 'th-1',
      senderAgentId: 'agent-a',
      text: 'starting now',
    });

    const c2 = new PersistentCollaborationService(adapter);
    expect(c2.listChannels()).toHaveLength(1);
    expect(c2.listThreads('ch-1')).toHaveLength(1);
    expect(c2.listMessages('th-1')).toHaveLength(1);
  });
});
