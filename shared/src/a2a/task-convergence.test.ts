import { describe, it, expect } from 'vitest';
import {
  a2aTaskToEnvelope,
  envelopeToA2ATask,
  agentIdentityToRef,
  agentRefToIdentity,
  type A2ATask,
} from './task-convergence';
import { TaskStateEnum, TASK_ENVELOPE_VERSION } from './schemas/task-envelope';
import type { RecoderAgentIdentity } from './types';

const requester: RecoderAgentIdentity = {
  id: 'agent-pm',
  name: 'PM Agent',
  platform: 'recoder_pm',
  instanceId: 'pm-1',
  team: 'product',
  version: '1.0.0',
};

const assignee: RecoderAgentIdentity = {
  id: 'agent-codex',
  name: 'Codex',
  platform: 'codex',
};

function baseTask(overrides: Partial<A2ATask> = {}): A2ATask {
  return {
    id: 'task_1',
    threadId: 'thr_1',
    createdAt: '2026-02-24T10:00:00.000Z',
    updatedAt: '2026-02-24T10:05:00.000Z',
    requester,
    assignee,
    state: TaskStateEnum.Working,
    prompt: 'Implement the auth flow',
    ...overrides,
  };
}

describe('agent identity <-> ref projection', () => {
  it('projects a full identity down to a canonical ref', () => {
    const ref = agentIdentityToRef(requester);
    expect(ref).toEqual({
      agent_id: 'agent-pm',
      platform: 'recoder_pm',
      name: 'PM Agent',
      instance_id: 'pm-1',
    });
  });

  it('lifts a ref back to an identity, defaulting name to the id when absent', () => {
    const identity = agentRefToIdentity({ agent_id: 'x', platform: 'codex' });
    expect(identity).toEqual({
      id: 'x',
      name: 'x',
      platform: 'codex',
      instanceId: undefined,
    });
  });
});

describe('a2aTaskToEnvelope', () => {
  it('lifts a flat A2ATask into the canonical TaskEnvelope', () => {
    const env = a2aTaskToEnvelope(baseTask(), { workspaceId: 'ws_1', traceId: 'trace_1' });

    expect(env.envelope_version).toBe(TASK_ENVELOPE_VERSION);
    expect(env.id).toBe('task_1');
    expect(env.workspace_id).toBe('ws_1');
    expect(env.thread_id).toBe('thr_1');
    expect(env.trace_id).toBe('trace_1');
    expect(env.state).toBe(TaskStateEnum.Working);
    expect(env.requester.agent_id).toBe('agent-pm');
    expect(env.assignee.agent_id).toBe('agent-codex');
    expect(env.payload).toEqual({ kind: 'text', text: 'Implement the auth flow' });
    expect(env.created_at).toBe('2026-02-24T10:00:00.000Z');
    expect(env.updated_at).toBe('2026-02-24T10:05:00.000Z');
  });

  it('defaults workspace, trace, and connector when not provided', () => {
    const env = a2aTaskToEnvelope(baseTask());
    expect(env.workspace_id).toBe('default');
    expect(env.trace_id).toBe('task_1');
    expect(env.connector.connector_id).toBe('control-plane');
    expect(env.connector.protocol).toBe('a2a');
  });

  it('maps resultText to result.text and error to a structured TaskErrorInfo', () => {
    const completed = a2aTaskToEnvelope(
      baseTask({ state: TaskStateEnum.Completed, resultText: 'done' })
    );
    expect(completed.result).toEqual({ text: 'done' });
    expect(completed.error).toBeUndefined();

    const failed = a2aTaskToEnvelope(
      baseTask({ state: TaskStateEnum.Failed, error: 'boom' })
    );
    expect(failed.error?.message).toBe('boom');
    expect(failed.error?.retryable).toBe(false);
  });
});

describe('envelopeToA2ATask', () => {
  it('projects a canonical envelope down to the flat A2ATask view', () => {
    const env = a2aTaskToEnvelope(baseTask({ resultText: 'ok' }));
    const task = envelopeToA2ATask(env);
    expect(task.id).toBe('task_1');
    expect(task.threadId).toBe('thr_1');
    expect(task.state).toBe(TaskStateEnum.Working);
    expect(task.prompt).toBe('Implement the auth flow');
    expect(task.resultText).toBe('ok');
    expect(task.requester.id).toBe('agent-pm');
  });

  it('extracts the first text part from a multi-part payload', () => {
    const env = a2aTaskToEnvelope(baseTask());
    const multi = {
      ...env,
      payload: [
        { kind: 'json' as const, data: { a: 1 } },
        { kind: 'text' as const, text: 'hello' },
      ],
    };
    expect(envelopeToA2ATask(multi).prompt).toBe('hello');
  });
});

describe('round-trip stability (text-shaped tasks)', () => {
  it('A2ATask -> Envelope -> A2ATask preserves the projected fields', () => {
    const original = baseTask({ state: TaskStateEnum.Completed, resultText: 'finished' });
    const round = envelopeToA2ATask(a2aTaskToEnvelope(original));

    expect(round.id).toBe(original.id);
    expect(round.threadId).toBe(original.threadId);
    expect(round.createdAt).toBe(original.createdAt);
    expect(round.updatedAt).toBe(original.updatedAt);
    expect(round.state).toBe(original.state);
    expect(round.prompt).toBe(original.prompt);
    expect(round.resultText).toBe(original.resultText);
    expect(round.requester.id).toBe(original.requester.id);
    expect(round.requester.platform).toBe(original.requester.platform);
    expect(round.assignee.id).toBe(original.assignee.id);
  });
});
