import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAMBDispatcher } from '../../../../../../../lib/amb-singleton';

const ALLOWED_INTENTS = new Set(['plan', 'execute', 'handoff', 'tool_call']);

function resolveExecutorUrl(intent: string): string {
  switch (intent) {
    case 'plan':
      return process.env.RECODER_A2A_INTENT_PLAN_EXECUTOR_URL || '';
    case 'execute':
      return process.env.RECODER_A2A_INTENT_EXECUTE_EXECUTOR_URL || '';
    case 'handoff':
      return process.env.RECODER_A2A_INTENT_HANDOFF_EXECUTOR_URL || '';
    case 'tool_call':
      return process.env.RECODER_A2A_INTENT_TOOL_CALL_EXECUTOR_URL || '';
    default:
      return '';
  }
}

function verifyWorkerToken(headers: Headers): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.RECODER_A2A_WORKER_TOKEN || '';
  if (!expected) {
    return { ok: true };
  }

  const provided = headers.get('x-recoder-a2a-worker-token') || '';
  if (!provided) {
    return { ok: false, status: 401, error: 'Unauthorized worker token' };
  }

  // Use timing-safe comparison to prevent side-channel attacks
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) {
    return { ok: false, status: 401, error: 'Unauthorized worker token' };
  }
  if (!timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, status: 401, error: 'Unauthorized worker token' };
  }
  return { ok: true };
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAmbDispatchEnabled(): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.RECODER_A2A_AMB_DISABLED === '1') return false;
  return true;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ intent: string }> },
) {
  const { intent: rawIntent } = await context.params;
  const intent = String(rawIntent || '').trim();
  if (!ALLOWED_INTENTS.has(intent)) {
    return NextResponse.json({ ok: false, error: 'Unsupported intent' }, { status: 400 });
  }

  const workerAuth = verifyWorkerToken(request.headers);
  if (!workerAuth.ok) {
    return NextResponse.json({ ok: false, error: workerAuth.error }, { status: workerAuth.status });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const bodyIntent = String(payload.intent || '');
  if (bodyIntent && bodyIntent !== intent) {
    return NextResponse.json({ ok: false, error: 'Intent mismatch between path and body' }, { status: 400 });
  }

  const envelope = (payload.envelope || {}) as { messageId?: string; threadId?: string };
  const executorUrl = resolveExecutorUrl(intent);
  const workflowId = `a2a_${intent}_${String(envelope.messageId || Date.now())}`;
  const taskId = `intent_${String(envelope.messageId || Date.now())}`;
  const ambDispatcher = isAmbDispatchEnabled() ? getAMBDispatcher() : null;

  if (ambDispatcher) {
    void ambDispatcher.onWorkflowStart(
      workflowId,
      'agency-a2a-intent-handler',
      `A2A intent ${intent}`,
    );
    void ambDispatcher.onTaskAssigned(
      workflowId,
      taskId,
      executorUrl ? 'a2a-intent-executor' : 'agency-a2a-intent-handler',
      executorUrl || 'no_executor_configured',
    );
  }

  let executor: Record<string, unknown> = { executed: false, reason: 'no_executor_configured' };
  if (executorUrl) {
    try {
      const response = await fetch(executorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, source: 'a2a-intent-handler', payload }),
      });
      executor = { executed: response.ok, status: response.status, url: executorUrl };
      if (response.ok && ambDispatcher) {
        void ambDispatcher.onTaskCompleted(
          workflowId,
          taskId,
          'a2a-intent-executor',
          `executor_status_${response.status}`,
        );
      } else if (ambDispatcher) {
        void ambDispatcher.onTaskFailed(
          workflowId,
          taskId,
          'a2a-intent-executor',
          `executor_status_${response.status}`,
        );
      }
    } catch (error) {
      console.error('[a2a] Executor error:', error);
      executor = {
        executed: false,
        error: error instanceof Error ? error.message : 'executor_failed',
        url: executorUrl,
      };
      if (ambDispatcher) {
        void ambDispatcher.onTaskFailed(
          workflowId,
          taskId,
          'a2a-intent-executor',
          error instanceof Error ? error.message : 'executor_failed',
        );
      }
    }
  } else {
    if (ambDispatcher) {
      void ambDispatcher.onTaskCompleted(
        workflowId,
        taskId,
        'agency-a2a-intent-handler',
        'no_executor_configured',
      );
    }
  }

  if (ambDispatcher) {
    void ambDispatcher.onWorkflowCompleted(
      workflowId,
      (executor as { executed?: boolean }).executed ? 'A2A intent forwarded' : 'A2A intent accepted without executor success',
    );
  }

  return NextResponse.json(
    {
      ok: true,
      intent,
      service: 'recoder-agency',
      acceptedAt: new Date().toISOString(),
      job: {
        messageId: String(envelope.messageId || ''),
        threadId: String(envelope.threadId || ''),
      },
      executor,
    },
    { status: 202 },
  );
}
