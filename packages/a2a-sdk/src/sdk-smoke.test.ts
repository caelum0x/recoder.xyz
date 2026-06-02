import { describe, expect, it } from 'vitest';

import {
  A2AErrorCodeEnum,
  AuditEventTypeEnum,
  TaskStateEnum,
  createTaskEnvelope,
} from './schemas';

import {
  mapCodexState,
  mapCodexStateStrict,
  mapClaudeState,
} from './state-mapping';
import { mapHttpError } from './error-mapping';
import { emitAuditForTransition } from './audit-helpers';
import { validateTaskEnvelope } from './validation';

describe('@recoder/a2a-sdk smoke', () => {
  it('maps Codex and Claude states to canonical task states', () => {
    expect(mapCodexState('running')).toBe(TaskStateEnum.Working);
    expect(mapClaudeState('done')).toBe(TaskStateEnum.Completed);
    expect(mapClaudeState('waiting_for_approval')).toBe(TaskStateEnum.InputRequired);
    expect(mapCodexState('unknown-state')).toBeUndefined();
  });

  it('throws on strict mapping for unknown connector states', () => {
    expect(() => mapCodexStateStrict('unknown-state')).toThrow(
      'Unknown Codex state: "unknown-state"',
    );
  });

  it('maps HTTP errors to canonical error taxonomy', () => {
    const err = mapHttpError(429, 'rate limited');
    expect(err.code).toBe(A2AErrorCodeEnum.RateLimitExceeded);
    expect(err.message).toBe('rate limited');
  });

  it('validates canonical task envelopes and rejects missing correlation ids', () => {
    const validEnvelope = createTaskEnvelope({
      id: 'task-1',
      workspace_id: 'ws-1',
      thread_id: 'thread-1',
      trace_id: 'trace-1',
      requester: { agent_id: 'req', platform: 'codex' },
      assignee: { agent_id: 'asg', platform: 'claude_code' },
      connector: { connector_id: 'claude:asg', platform: 'claude_code', protocol: 'mcp' },
      payload: [{ kind: 'text', text: 'Approve and continue' }],
    });
    expect(validateTaskEnvelope(validEnvelope).valid).toBe(true);

    const invalid = {
      ...validEnvelope,
      workspace_id: '',
    };
    const result = validateTaskEnvelope(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.path === 'workspace_id')).toBe(true);
  });

  it('emits canonical input-required audit events for approval waits', () => {
    const audit = emitAuditForTransition(
      {
        id: 'audit-1',
        actor_agent_id: 'claude-agent',
        actor_platform: 'claude_code',
        task_id: 'task-approval',
        trace_id: 'trace-approval',
        workspace_id: 'ws-approval',
        thread_id: 'thread-approval',
      },
      TaskStateEnum.InputRequired,
    );

    expect(audit.event_type).toBe(AuditEventTypeEnum.TaskInputRequired);
    expect(audit.workspace_id).toBe('ws-approval');
    expect(audit.thread_id).toBe('thread-approval');
  });
});
