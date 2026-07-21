/**
 * `openai-compat.routes` workspace correlation — verifies the correlating edge:
 * the workspace-scoped mount (`/ws/:workspaceId/v1/chat/completions`) stamps
 * `correlationWorkspaceId` onto the dispatched `InferenceRequest`, while the plain
 * mount leaves it unset. The stamp NEVER affects routing/model/cost — it only
 * drives the run-inference sink downstream.
 */
import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { handleChatCompletion, type InferenceOpenAiCompatDeps } from './openai-compat.routes.js';
import type { InferenceRequest } from '../types.js';

function fakeRes(): Response {
  const res: Partial<Response> = {
    status() {
      return res as Response;
    },
    json() {
      return res as Response;
    },
    setHeader() {
      return res as Response;
    },
    flushHeaders() {},
    write() {
      return true;
    },
    end() {
      return res as Response;
    },
  };
  return res as Response;
}

/** Build a req with an optional `params.workspaceId` (as the correlating mount supplies). */
function reqOf(body: unknown, params?: Record<string, string>): Request {
  return { body, principal: { userId: 'u1' }, params: params ?? {} } as unknown as Request;
}

function depsCapturing(captured: { request?: InferenceRequest }): InferenceOpenAiCompatDeps {
  return {
    routing: {
      complete: async (request) => {
        captured.request = request;
        return { routed: true, tier: 'napi', model: request.model, content: 'ok', inferenceId: 'inf-1' };
      },
      completeStream: async (request, onDelta) => {
        captured.request = request;
        onDelta({ role: 'assistant' });
        onDelta({ content: 'ok' });
        return { routed: true, tier: 'napi', model: request.model, content: 'ok', inferenceId: 'inf-1', streamed: true, tokenGranular: true };
      },
    },
    idFactory: () => 'chatcmpl-test',
    now: () => 1_700_000_000,
  };
}

describe('openai-compat workspace correlation', () => {
  it('stamps correlationWorkspaceId from the /ws/:workspaceId mount', async () => {
    const captured: { request?: InferenceRequest } = {};
    await handleChatCompletion(
      depsCapturing(captured),
      reqOf({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }, { workspaceId: 'ws-42' }),
      fakeRes(),
    );
    expect(captured.request?.correlationWorkspaceId).toBe('ws-42');
    expect(captured.request?.userId).toBe('u1');
  });

  it('leaves correlationWorkspaceId unset on the plain mount (no workspace param)', async () => {
    const captured: { request?: InferenceRequest } = {};
    await handleChatCompletion(
      depsCapturing(captured),
      reqOf({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
      fakeRes(),
    );
    expect(captured.request?.correlationWorkspaceId).toBeUndefined();
  });

  it('stamps on the streamed path too', async () => {
    const captured: { request?: InferenceRequest } = {};
    await handleChatCompletion(
      depsCapturing(captured),
      reqOf({ model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] }, { workspaceId: 'ws-9' }),
      fakeRes(),
    );
    expect(captured.request?.correlationWorkspaceId).toBe('ws-9');
  });

  it('ignores a blank workspace segment (treated as unset)', async () => {
    const captured: { request?: InferenceRequest } = {};
    await handleChatCompletion(
      depsCapturing(captured),
      reqOf({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }, { workspaceId: '   ' }),
      fakeRes(),
    );
    expect(captured.request?.correlationWorkspaceId).toBeUndefined();
  });
});
