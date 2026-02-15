import type { ActionFunctionArgs } from '@remix-run/cloudflare';

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
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, error: 'Unauthorized worker token' };
  }
  return { ok: true };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const intent = String(params.intent || '').trim();
  if (!ALLOWED_INTENTS.has(intent)) {
    return new Response(JSON.stringify({ ok: false, error: 'Unsupported intent' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const workerAuth = verifyWorkerToken(request.headers);
  if (!workerAuth.ok) {
    return new Response(JSON.stringify({ ok: false, error: workerAuth.error }), {
      status: workerAuth.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const bodyIntent = String(payload.intent || '');
  if (bodyIntent && bodyIntent !== intent) {
    return new Response(JSON.stringify({ ok: false, error: 'Intent mismatch between path and body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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
      executor = { executed: response.ok, url: executorUrl, status: response.status };
    } catch (error) {
      executor = { executed: false, url: executorUrl, error: String((error as Error)?.message || 'executor_failed') };
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      intent,
      service: 'recoder-web',
      acceptedAt: new Date().toISOString(),
      job: {
        messageId: String(envelope.messageId || ''),
        threadId: String(envelope.threadId || ''),
      },
      executor,
    }),
    {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
