/**
 * @module task-lifecycle.test
 *
 * Comprehensive test suite for the A2A task lifecycle enforcement layer.
 *
 * Covers:
 * - TaskLifecycleService: creation, transitions, rejections, convenience methods
 * - Task lifecycle middleware: body validation, task loading
 * - Route handlers: happy paths, error paths, edge cases
 * - Audit event emission
 * - Full lifecycle workflows (submitted -> working -> completed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TaskLifecycleService,
  InMemoryTaskStore,
  resetTaskLifecycleService,
  getTaskLifecycleService,
  generateId,
  type CreateTaskInput,
  type TransitionTaskInput,
  type AuditEventSink,
} from '../task-lifecycle.service';
import {
  validateCreateTaskBody,
  validateTransitionBody,
  loadTaskEnvelope,
  parseJsonTextBody,
} from '../task-lifecycle.middleware';
import {
  TaskStateEnum,
  A2AErrorCodeEnum,
  type TaskEnvelope,
  type AuditEvent,
} from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeCreateInput(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
  return {
    workspace_id: 'ws_test',
    thread_id: 'thr_test',
    requester: {
      agent_id: 'agent-pm',
      platform: 'recoder_pm',
    },
    assignee: {
      agent_id: 'agent-codex',
      platform: 'codex',
    },
    connector: {
      platform: 'codex',
      protocol: 'jsonrpc',
      connector_id: 'codex-v1',
    },
    payload: { kind: 'text', text: 'Test task' },
    ...overrides,
  };
}

function makeMockReq(body?: any, params?: any, query?: any): any {
  return {
    body: body ?? {},
    params: params ?? {},
    query: query ?? {},
    headers: {},
  };
}

function makeMockRes(): any {
  const res: any = {
    _status: 200,
    _data: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._data = data;
      return res;
    },
  };
  return res;
}

function makeMockNext(): any {
  const fn: any = vi.fn();
  return fn;
}

// ===========================================================================
// TaskLifecycleService
// ===========================================================================

describe('TaskLifecycleService', () => {
  let service: TaskLifecycleService;

  beforeEach(() => {
    service = new TaskLifecycleService(new InMemoryTaskStore());
    resetTaskLifecycleService();
  });

  // -----------------------------------------------------------------------
  // Creation
  // -----------------------------------------------------------------------

  describe('createTask', () => {
    it('creates a task in submitted state with generated IDs', () => {
      const result = service.createTask(makeCreateInput());
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const envelope = result.data;
      expect(envelope.state).toBe(TaskStateEnum.Submitted);
      expect(envelope.id).toMatch(/^task_/);
      expect(envelope.trace_id).toBeTruthy();
      expect(envelope.workspace_id).toBe('ws_test');
      expect(envelope.thread_id).toBe('thr_test');
      expect(envelope.requester.agent_id).toBe('agent-pm');
      expect(envelope.assignee.agent_id).toBe('agent-codex');
      expect(envelope.history).toEqual([]);
      expect(envelope.envelope_version).toBe('1.0.0');
    });

    it('uses provided trace_id when given', () => {
      const result = service.createTask(makeCreateInput({ trace_id: 'my-trace-123' }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.trace_id).toBe('my-trace-123');
    });

    it('returns error for missing workspace_id', () => {
      const result = service.createTask(makeCreateInput({ workspace_id: '' }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(400);
      expect(result.error.code).toBe(A2AErrorCodeEnum.MissingEnvelopeField);
      expect(result.error.details?.missing_fields).toContain('workspace_id');
    });

    it('returns error for missing requester', () => {
      const result = service.createTask(makeCreateInput({ requester: {} as any }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(A2AErrorCodeEnum.MissingEnvelopeField);
    });

    it('returns error for missing connector fields', () => {
      const result = service.createTask(makeCreateInput({
        connector: { connector_id: '', platform: '' as any, protocol: '' as any },
      }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.details?.missing_fields).toContain('connector.connector_id');
    });

    it('returns error for null payload', () => {
      const result = service.createTask(makeCreateInput({ payload: null as any }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.details?.missing_fields).toContain('payload');
    });
  });

  // -----------------------------------------------------------------------
  // Retrieval
  // -----------------------------------------------------------------------

  describe('getTask', () => {
    it('retrieves an existing task', () => {
      const created = service.createTask(makeCreateInput());
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const result = service.getTask(created.data.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.id).toBe(created.data.id);
    });

    it('returns TASK_NOT_FOUND for non-existent task', () => {
      const result = service.getTask('task_nonexistent');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(404);
      expect(result.error.code).toBe(A2AErrorCodeEnum.TaskNotFound);
    });
  });

  describe('getTaskHistory', () => {
    it('returns empty history for a freshly created task', () => {
      const created = service.createTask(makeCreateInput());
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const result = service.getTaskHistory(created.data.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual([]);
    });

    it('returns history after transitions', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);
      service.completeTask(created.data.id);

      const result = service.getTaskHistory(created.data.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(2);
      expect(result.data[0].from).toBe(TaskStateEnum.Submitted);
      expect(result.data[0].to).toBe(TaskStateEnum.Working);
      expect(result.data[1].from).toBe(TaskStateEnum.Working);
      expect(result.data[1].to).toBe(TaskStateEnum.Completed);
    });

    it('returns TASK_NOT_FOUND for non-existent task', () => {
      const result = service.getTaskHistory('task_nonexistent');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(A2AErrorCodeEnum.TaskNotFound);
    });
  });

  describe('listTasks', () => {
    it('lists all tasks', () => {
      service.createTask(makeCreateInput());
      service.createTask(makeCreateInput());

      const result = service.listTasks();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(2);
    });

    it('filters by workspace_id', () => {
      service.createTask(makeCreateInput({ workspace_id: 'ws_a' }));
      service.createTask(makeCreateInput({ workspace_id: 'ws_b' }));

      const result = service.listTasks({ workspace_id: 'ws_a' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].workspace_id).toBe('ws_a');
    });

    it('filters by state', () => {
      const created1 = service.createTask(makeCreateInput());
      const created2 = service.createTask(makeCreateInput());
      if (!created1.ok || !created2.ok) return;

      service.startTask(created1.data.id);

      const result = service.listTasks({ state: TaskStateEnum.Working });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].state).toBe(TaskStateEnum.Working);
    });

    it('respects limit and offset', () => {
      for (let i = 0; i < 5; i++) {
        service.createTask(makeCreateInput());
      }

      const result = service.listTasks({ limit: 2, offset: 1 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // State transitions
  // -----------------------------------------------------------------------

  describe('transitionTask', () => {
    it('transitions submitted -> working', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      const result = service.transitionTask(created.data.id, {
        target_state: TaskStateEnum.Working,
        reason: 'Starting execution',
        triggered_by: 'orchestrator',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Working);
      expect(result.data.history).toHaveLength(1);
      expect(result.data.history![0].from).toBe(TaskStateEnum.Submitted);
      expect(result.data.history![0].to).toBe(TaskStateEnum.Working);
      expect(result.data.history![0].reason).toBe('Starting execution');
      expect(result.data.history![0].triggered_by).toBe('orchestrator');
    });

    it('transitions working -> completed with result', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);

      const result = service.transitionTask(created.data.id, {
        target_state: TaskStateEnum.Completed,
        result: { text: 'All done', data: { files_changed: 3 } },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Completed);
      expect(result.data.result?.text).toBe('All done');
    });

    it('transitions working -> failed with error info', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);

      const result = service.transitionTask(created.data.id, {
        target_state: TaskStateEnum.Failed,
        error: {
          code: 'CONNECTOR_TIMEOUT',
          category: 'connector',
          message: 'Codex timed out',
          severity: 'high',
          retryable: true,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Failed);
      expect(result.data.error?.code).toBe('CONNECTOR_TIMEOUT');
    });

    it('transitions working -> input-required -> working', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);
      service.requestInput(created.data.id, 'Need clarification');

      const task = service.getTask(created.data.id);
      if (!task.ok) return;
      expect(task.data.state).toBe(TaskStateEnum.InputRequired);

      // Resume working
      const resumed = service.startTask(created.data.id);
      expect(resumed.ok).toBe(true);
      if (!resumed.ok) return;
      expect(resumed.data.state).toBe(TaskStateEnum.Working);
      expect(resumed.data.history).toHaveLength(3);
    });

    it('rejects invalid transition: submitted -> completed', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      const result = service.transitionTask(created.data.id, {
        target_state: TaskStateEnum.Completed,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(422);
      expect(result.error.code).toBe(A2AErrorCodeEnum.InvalidStateTransition);
      expect(result.error.details?.current_state).toBe(TaskStateEnum.Submitted);
      expect(result.error.details?.requested_state).toBe(TaskStateEnum.Completed);
    });

    it('rejects invalid transition: submitted -> input-required', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      const result = service.transitionTask(created.data.id, {
        target_state: TaskStateEnum.InputRequired,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(A2AErrorCodeEnum.InvalidStateTransition);
    });

    it('rejects transition from terminal state (completed)', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);
      service.completeTask(created.data.id);

      const result = service.transitionTask(created.data.id, {
        target_state: TaskStateEnum.Working,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(409);
      expect(result.error.code).toBe(A2AErrorCodeEnum.TaskAlreadyTerminal);
    });

    it('rejects transition from terminal state (failed)', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);
      service.failTask(created.data.id);

      const result = service.transitionTask(created.data.id, {
        target_state: TaskStateEnum.Working,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(A2AErrorCodeEnum.TaskAlreadyTerminal);
    });

    it('rejects transition from terminal state (cancelled)', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.cancelTask(created.data.id);

      const result = service.transitionTask(created.data.id, {
        target_state: TaskStateEnum.Working,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(A2AErrorCodeEnum.TaskAlreadyTerminal);
    });

    it('returns TASK_NOT_FOUND for non-existent task', () => {
      const result = service.transitionTask('task_nonexistent', {
        target_state: TaskStateEnum.Working,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(404);
      expect(result.error.code).toBe(A2AErrorCodeEnum.TaskNotFound);
    });
  });

  // -----------------------------------------------------------------------
  // Convenience methods
  // -----------------------------------------------------------------------

  describe('convenience methods', () => {
    it('startTask transitions to working', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      const result = service.startTask(created.data.id, 'connector-codex');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Working);
    });

    it('completeTask transitions to completed with result', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);
      const result = service.completeTask(
        created.data.id,
        { text: 'Done', artifacts: [] },
        'connector-codex',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Completed);
      expect(result.data.result?.text).toBe('Done');
    });

    it('failTask transitions to failed', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);
      const result = service.failTask(created.data.id, {
        code: 'CONNECTOR_ERROR',
        category: 'connector',
        message: 'Something broke',
        severity: 'high',
        retryable: false,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Failed);
      expect(result.data.error?.message).toBe('Something broke');
    });

    it('cancelTask transitions to cancelled', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      const result = service.cancelTask(created.data.id, 'User cancelled');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.Cancelled);
    });

    it('requestInput transitions to input-required', () => {
      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);
      const result = service.requestInput(created.data.id, 'Need API key');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.state).toBe(TaskStateEnum.InputRequired);
    });
  });

  // -----------------------------------------------------------------------
  // Audit events
  // -----------------------------------------------------------------------

  describe('audit event emission', () => {
    it('emits task.submitted on creation', () => {
      const events: AuditEvent[] = [];
      service.addAuditSink((event) => { events.push(event); });

      service.createTask(makeCreateInput());

      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('task.submitted');
      expect(events[0].target.kind).toBe('task');
    });

    it('emits task.started on transition to working', () => {
      const events: AuditEvent[] = [];
      service.addAuditSink((event) => { events.push(event); });

      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);

      // 1 for creation, 1 for transition
      expect(events).toHaveLength(2);
      expect(events[1].event_type).toBe('task.started');
    });

    it('emits task.completed on completion', () => {
      const events: AuditEvent[] = [];
      service.addAuditSink((event) => { events.push(event); });

      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);
      service.completeTask(created.data.id);

      expect(events).toHaveLength(3);
      expect(events[2].event_type).toBe('task.completed');
      expect(events[2].severity).toBe('info');
    });

    it('emits task.failed with error severity', () => {
      const events: AuditEvent[] = [];
      service.addAuditSink((event) => { events.push(event); });

      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.startTask(created.data.id);
      service.failTask(created.data.id);

      expect(events).toHaveLength(3);
      expect(events[2].event_type).toBe('task.failed');
      expect(events[2].severity).toBe('error');
    });

    it('emits task.cancelled with warning severity', () => {
      const events: AuditEvent[] = [];
      service.addAuditSink((event) => { events.push(event); });

      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.cancelTask(created.data.id);

      expect(events).toHaveLength(2);
      expect(events[1].event_type).toBe('task.cancelled');
      expect(events[1].severity).toBe('warning');
    });

    it('does not emit audit events for invalid transitions', () => {
      const events: AuditEvent[] = [];
      service.addAuditSink((event) => { events.push(event); });

      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      // Invalid: submitted -> completed
      service.transitionTask(created.data.id, { target_state: TaskStateEnum.Completed });

      // Only the creation event
      expect(events).toHaveLength(1);
    });

    it('includes transition metadata in audit event', () => {
      const events: AuditEvent[] = [];
      service.addAuditSink((event) => { events.push(event); });

      const created = service.createTask(makeCreateInput());
      if (!created.ok) return;

      service.transitionTask(created.data.id, {
        target_state: TaskStateEnum.Working,
        reason: 'Starting now',
        triggered_by: 'agent-pm',
      });

      const transitionEvent = events[1];
      expect(transitionEvent.metadata?.from_state).toBe(TaskStateEnum.Submitted);
      expect(transitionEvent.metadata?.to_state).toBe(TaskStateEnum.Working);
      expect(transitionEvent.metadata?.reason).toBe('Starting now');
    });

    it('continues even if a sink throws', () => {
      const events: AuditEvent[] = [];
      service.addAuditSink(() => { throw new Error('sink failed'); });
      service.addAuditSink((event) => { events.push(event); });

      const created = service.createTask(makeCreateInput());
      expect(created.ok).toBe(true);
      // The second sink should still receive the event
      expect(events).toHaveLength(1);
    });

    it('retains recent audit records with sensitive metadata redacted', () => {
      const result = service.createTask(makeCreateInput());
      if (!result.ok) return;

      service.transitionTask(result.data.id, {
        target_state: TaskStateEnum.Working,
        reason: 'work',
        triggered_by: 'agent-x',
      });

      const audits = service.getRecentAuditEvents(10);
      expect(audits.length).toBeGreaterThanOrEqual(2);

      const manualSink = vi.fn();
      service.addAuditSink(manualSink);
      (service as any).emitAudit({
        id: 'evt_manual',
        event_type: 'task.progress',
        severity: 'info',
        actor: { kind: 'system', id: 'svc' },
        target: { kind: 'task', id: result.data.id },
        trace_id: result.data.trace_id,
        workspace_id: result.data.workspace_id,
        thread_id: result.data.thread_id,
        task_id: result.data.id,
        timestamp: new Date().toISOString(),
        metadata: {
          apiKey: 'super-secret',
          nested: { token: 'abc' },
          safe: 'ok',
        },
      } as AuditEvent);

      const latest = service.getRecentAuditEvents(1)[0];
      expect(latest).toBeTruthy();
      expect(latest.metadata).toEqual({
        apiKey: '[REDACTED]',
        nested: { token: '[REDACTED]' },
        safe: 'ok',
      });
    });
  });

  // -----------------------------------------------------------------------
  // Singleton
  // -----------------------------------------------------------------------

  describe('singleton management', () => {
    it('returns the same instance on repeated calls', () => {
      resetTaskLifecycleService();
      const a = getTaskLifecycleService();
      const b = getTaskLifecycleService();
      expect(a).toBe(b);
    });

    it('returns a new instance after reset', () => {
      resetTaskLifecycleService();
      const a = getTaskLifecycleService();
      resetTaskLifecycleService();
      const b = getTaskLifecycleService();
      expect(a).not.toBe(b);
    });
  });
});

// ===========================================================================
// InMemoryTaskStore
// ===========================================================================

describe('InMemoryTaskStore', () => {
  it('basic CRUD operations', () => {
    const store = new InMemoryTaskStore();
    expect(store.size).toBe(0);

    const envelope = { id: 'task_1' } as TaskEnvelope;
    store.set('task_1', envelope);
    expect(store.has('task_1')).toBe(true);
    expect(store.get('task_1')?.id).toBe('task_1');
    expect(store.size).toBe(1);

    store.delete('task_1');
    expect(store.has('task_1')).toBe(false);
    expect(store.size).toBe(0);
  });

  it('clear removes all items', () => {
    const store = new InMemoryTaskStore();
    store.set('a', { id: 'a' } as TaskEnvelope);
    store.set('b', { id: 'b' } as TaskEnvelope);
    expect(store.size).toBe(2);

    store.clear();
    expect(store.size).toBe(0);
  });
});

// ===========================================================================
// Middleware
// ===========================================================================

describe('Middleware', () => {
  describe('validateCreateTaskBody', () => {
    it('passes valid body', () => {
      const req = makeMockReq({
        workspace_id: 'ws_1',
        thread_id: 'thr_1',
        requester: { agent_id: 'a', platform: 'codex' },
        assignee: { agent_id: 'b', platform: 'codex' },
        connector: { connector_id: 'c', platform: 'codex', protocol: 'jsonrpc' },
        payload: { kind: 'text', text: 'hello' },
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateCreateTaskBody(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res._status).toBe(200); // unchanged
    });

    it('rejects non-object body', () => {
      const req = makeMockReq(null);
      const res = makeMockRes();
      const next = makeMockNext();

      validateCreateTaskBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
      expect(res._data.error.code).toBe(A2AErrorCodeEnum.InvalidEnvelope);
    });

    it('rejects missing workspace_id', () => {
      const req = makeMockReq({
        thread_id: 'thr_1',
        requester: { agent_id: 'a', platform: 'codex' },
        assignee: { agent_id: 'b', platform: 'codex' },
        connector: { connector_id: 'c', platform: 'codex', protocol: 'jsonrpc' },
        payload: {},
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateCreateTaskBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects missing nested required fields', () => {
      const req = makeMockReq({
        workspace_id: 'ws_1',
        thread_id: 'thr_1',
        requester: { platform: 'codex' }, // missing agent_id
        assignee: { agent_id: 'b', platform: 'codex' },
        connector: { connector_id: 'c', platform: 'codex', protocol: 'jsonrpc' },
        payload: {},
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateCreateTaskBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
      expect(res._data.error.details.validation_issues).toContain(
        'requester.agent_id must be a non-empty string',
      );
    });
  });

  describe('validateTransitionBody', () => {
    it('passes valid transition body', () => {
      const req = makeMockReq({
        target_state: 'working',
        reason: 'Starting',
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateTransitionBody(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('rejects invalid target_state', () => {
      const req = makeMockReq({ target_state: 'bogus_state' });
      const res = makeMockRes();
      const next = makeMockNext();

      validateTransitionBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
      expect(res._data.error.details.validation_issues[0]).toContain('target_state must be one of');
    });

    it('rejects missing target_state', () => {
      const req = makeMockReq({});
      const res = makeMockRes();
      const next = makeMockNext();

      validateTransitionBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('rejects result for non-completed transition', () => {
      const req = makeMockReq({
        target_state: 'working',
        result: { text: 'done' },
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateTransitionBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._data.error.details.validation_issues).toContain(
        'result can only be provided when target_state is "completed"',
      );
    });

    it('rejects error for non-failed transition', () => {
      const req = makeMockReq({
        target_state: 'completed',
        error: { code: 'ERR', message: 'fail' },
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateTransitionBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._data.error.details.validation_issues).toContain(
        'error can only be provided when target_state is "failed"',
      );
    });

    it('allows result for completed transition', () => {
      const req = makeMockReq({
        target_state: 'completed',
        result: { text: 'all good' },
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateTransitionBody(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('allows error for failed transition', () => {
      const req = makeMockReq({
        target_state: 'failed',
        error: { code: 'ERR', category: 'task', message: 'fail', severity: 'high', retryable: false },
      });
      const res = makeMockRes();
      const next = makeMockNext();

      validateTransitionBody(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('loadTaskEnvelope', () => {
    it('loads an existing task onto the request', () => {
      resetTaskLifecycleService();
      const svc = getTaskLifecycleService();
      const created = svc.createTask(makeCreateInput());
      if (!created.ok) return;

      const req = makeMockReq(undefined, { taskId: created.data.id });
      const res = makeMockRes();
      const next = makeMockNext();

      loadTaskEnvelope(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.taskEnvelope?.id).toBe(created.data.id);
    });

    it('returns 404 for non-existent task', () => {
      resetTaskLifecycleService();
      const req = makeMockReq(undefined, { taskId: 'task_nope' });
      const res = makeMockRes();
      const next = makeMockNext();

      loadTaskEnvelope(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(404);
    });

    it('returns 400 for missing taskId param', () => {
      const req = makeMockReq(undefined, {});
      const res = makeMockRes();
      const next = makeMockNext();

      loadTaskEnvelope(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });
  });

  describe('parseJsonTextBody', () => {
    it('parses string body into JSON', () => {
      const req = makeMockReq('{"key":"value"}');
      const res = makeMockRes();
      const next = makeMockNext();

      parseJsonTextBody(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.body).toEqual({ key: 'value' });
    });

    it('returns error for invalid JSON string', () => {
      const req = makeMockReq('not-json');
      const res = makeMockRes();
      const next = makeMockNext();

      parseJsonTextBody(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
      expect(res._data.error.code).toBe(A2AErrorCodeEnum.InvalidPayload);
    });

    it('passes through object body unchanged', () => {
      const body = { already: 'parsed' };
      const req = makeMockReq(body);
      const res = makeMockRes();
      const next = makeMockNext();

      parseJsonTextBody(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.body).toBe(body);
    });
  });
});

// ===========================================================================
// generateId
// ===========================================================================

describe('generateId', () => {
  it('generates prefixed IDs', () => {
    const id = generateId('task');
    expect(id).toMatch(/^task_/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('test')));
    expect(ids.size).toBe(100);
  });
});

// ===========================================================================
// Full lifecycle integration
// ===========================================================================

describe('Full lifecycle integration', () => {
  let service: TaskLifecycleService;
  let auditEvents: AuditEvent[];

  beforeEach(() => {
    service = new TaskLifecycleService(new InMemoryTaskStore());
    auditEvents = [];
    service.addAuditSink((event) => { auditEvents.push(event); });
  });

  it('submitted -> working -> completed (happy path)', () => {
    const created = service.createTask(makeCreateInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const taskId = created.data.id;

    const started = service.startTask(taskId, 'connector-codex');
    expect(started.ok).toBe(true);

    const completed = service.completeTask(taskId, { text: 'Done', artifacts: [] }, 'connector-codex');
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    expect(completed.data.state).toBe(TaskStateEnum.Completed);
    expect(completed.data.history).toHaveLength(2);
    expect(auditEvents).toHaveLength(3);
    expect(auditEvents.map((e) => e.event_type)).toEqual([
      'task.submitted',
      'task.started',
      'task.completed',
    ]);
  });

  it('enriches completed task results with preview and evidence linkage', () => {
    const created = service.createTask(makeCreateInput({
      metadata: {
        previewUrl: 'https://preview.recoder.xyz/run-123',
      },
    }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const taskId = created.data.id;
    service.startTask(taskId, 'connector-codex');

    const completed = service.completeTask(
      taskId,
      {
        text: 'Done',
        data: {
          filesChanged: ['src/app.tsx', 'README.md'],
        },
        artifacts: [
          {
            key: 'artifact-1',
            artifact_type: 'file',
            mime_type: 'text/plain',
            content: 'export const ok = true;',
            path: 'src/app.tsx',
          },
        ],
      },
      'connector-codex',
    );

    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    expect(completed.data.result?.preview).toEqual([
      expect.objectContaining({ url: 'https://preview.recoder.xyz/run-123' }),
    ]);
    expect(completed.data.result?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'trace', ref: completed.data.trace_id }),
        expect.objectContaining({ kind: 'preview', ref: 'https://preview.recoder.xyz/run-123' }),
        expect.objectContaining({ kind: 'artifact', ref: 'artifact-1' }),
        expect.objectContaining({ kind: 'file-change', ref: 'src/app.tsx' }),
      ]),
    );
  });

  it('submitted -> working -> input-required -> working -> completed', () => {
    const created = service.createTask(makeCreateInput());
    if (!created.ok) return;

    const taskId = created.data.id;

    service.startTask(taskId);
    service.requestInput(taskId, 'Need clarification');
    service.startTask(taskId); // Resume after input
    const completed = service.completeTask(taskId, { text: 'Final answer' });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    expect(completed.data.state).toBe(TaskStateEnum.Completed);
    expect(completed.data.history).toHaveLength(4);
    expect(auditEvents).toHaveLength(5);
    expect(auditEvents.map((e) => e.event_type)).toEqual([
      'task.submitted',
      'task.started',
      'task.input_required',
      'task.started',
      'task.completed',
    ]);
  });

  it('submitted -> working -> failed', () => {
    const created = service.createTask(makeCreateInput());
    if (!created.ok) return;

    service.startTask(created.data.id);
    const failed = service.failTask(created.data.id, {
      code: 'TASK_EXECUTION_FAILED',
      category: 'task',
      message: 'Codex crashed',
      severity: 'high',
      retryable: true,
    });
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;

    expect(failed.data.state).toBe(TaskStateEnum.Failed);
    expect(failed.data.error?.message).toBe('Codex crashed');
    expect(auditEvents).toHaveLength(3);
  });

  it('submitted -> cancelled', () => {
    const created = service.createTask(makeCreateInput());
    if (!created.ok) return;

    const cancelled = service.cancelTask(created.data.id, 'User changed mind');
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;

    expect(cancelled.data.state).toBe(TaskStateEnum.Cancelled);
    expect(cancelled.data.history).toHaveLength(1);
    expect(cancelled.data.history![0].reason).toBe('User changed mind');
  });

  it('rejects further transitions after terminal state', () => {
    const created = service.createTask(makeCreateInput());
    if (!created.ok) return;

    service.startTask(created.data.id);
    service.completeTask(created.data.id);

    // Attempt to fail a completed task
    const result = service.failTask(created.data.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(A2AErrorCodeEnum.TaskAlreadyTerminal);
  });

  it('cancellation is allowed from all non-terminal states', () => {
    // submitted -> cancelled
    const t1 = service.createTask(makeCreateInput());
    if (!t1.ok) return;
    expect(service.cancelTask(t1.data.id).ok).toBe(true);

    // working -> cancelled
    const t2 = service.createTask(makeCreateInput());
    if (!t2.ok) return;
    service.startTask(t2.data.id);
    expect(service.cancelTask(t2.data.id).ok).toBe(true);

    // input-required -> cancelled
    const t3 = service.createTask(makeCreateInput());
    if (!t3.ok) return;
    service.startTask(t3.data.id);
    service.requestInput(t3.data.id);
    expect(service.cancelTask(t3.data.id).ok).toBe(true);
  });

  it('failure is allowed from all non-terminal states', () => {
    // submitted -> failed
    const t1 = service.createTask(makeCreateInput());
    if (!t1.ok) return;
    expect(service.failTask(t1.data.id).ok).toBe(true);

    // working -> failed
    const t2 = service.createTask(makeCreateInput());
    if (!t2.ok) return;
    service.startTask(t2.data.id);
    expect(service.failTask(t2.data.id).ok).toBe(true);

    // input-required -> failed
    const t3 = service.createTask(makeCreateInput());
    if (!t3.ok) return;
    service.startTask(t3.data.id);
    service.requestInput(t3.data.id);
    expect(service.failTask(t3.data.id).ok).toBe(true);
  });
});
