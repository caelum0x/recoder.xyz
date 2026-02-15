import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

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
    console.error('[a2a] RECODER_A2A_WORKER_TOKEN is not configured — rejecting request');
    return { ok: false, status: 503, error: 'Service not configured' };
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
  const executorUrl = resolveExecutorUrl(intent);

  let executor: Record<string, unknown> = { executed: false, reason: 'no_executor_configured' };
  if (executorUrl) {
    try {
      const response = await fetch(executorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, source: 'a2a-intent-handler', payload }),
      });
      executor = { executed: response.ok, status: response.status };
    } catch (error) {
      console.error('[a2a] Executor error:', error);
      executor = { executed: false, error: 'executor_failed' };
    }
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
