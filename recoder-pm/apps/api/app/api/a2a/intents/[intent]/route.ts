import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  PmInteropEvents,
  createPmTraceId,
  trackPmInteropEvent,
} from '@/lib/analytics';

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
  if (!expected) return { ok: true };

  const provided = headers.get('x-recoder-a2a-worker-token') || '';
  if (!provided || expected.length !== provided.length) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { intent: string } }) {
  const intent = String(params.intent || '').trim();
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
  const traceId = createPmTraceId();
  const connectorId = `intent-executor:${intent}`;

  trackPmInteropEvent(PmInteropEvents.CONNECTOR_INVOKED, {
    connector_id: connectorId,
    traceId,
    intent,
    messageId: String(envelope.messageId || ''),
    threadId: String(envelope.threadId || ''),
  });

  const executorUrl = resolveExecutorUrl(intent);

  let executor: Record<string, unknown> = { executed: false, reason: 'no_executor_configured' };
  if (executorUrl) {
    const executorStart = Date.now();
    try {
      const response = await fetch(executorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, source: 'a2a-intent-handler', payload }),
      });
      const durationMs = Date.now() - executorStart;
      executor = { executed: response.ok, status: response.status };

      if (response.ok) {
        trackPmInteropEvent(PmInteropEvents.CONNECTOR_RESPONSE, {
          connector_id: connectorId,
          traceId,
          intent,
          messageId: String(envelope.messageId || ''),
          threadId: String(envelope.threadId || ''),
          responseStatus: response.status,
          durationMs,
        });
      } else {
        trackPmInteropEvent(PmInteropEvents.CONNECTOR_ERROR, {
          connector_id: connectorId,
          traceId,
          intent,
          messageId: String(envelope.messageId || ''),
          threadId: String(envelope.threadId || ''),
          responseStatus: response.status,
          errorMessage: `Executor returned ${response.status}`,
          durationMs,
        });
      }
    } catch {
      const durationMs = Date.now() - executorStart;
      executor = { executed: false, error: 'executor_failed' };
      trackPmInteropEvent(PmInteropEvents.CONNECTOR_ERROR, {
        connector_id: connectorId,
        traceId,
        intent,
        messageId: String(envelope.messageId || ''),
        threadId: String(envelope.threadId || ''),
        errorMessage: 'executor_failed',
        durationMs,
      });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      intent,
      service: 'recoder-pm-api',
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
