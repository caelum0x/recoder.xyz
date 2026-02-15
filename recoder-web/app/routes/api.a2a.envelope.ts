import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import {
  buildInvalidA2AEnvelopeError,
  checkAndStoreEnvelopeIdempotency,
  handleA2AIntent,
  parseEnvelopeFromUnknown,
  verifyIncomingA2ARequest,
} from '~/lib/.server/a2a-gateway';

export async function action({ request }: ActionFunctionArgs) {
  const rawBody = await request.text();
  const verification = await verifyIncomingA2ARequest({
    headers: request.headers,
    rawBody,
  });

  if (!verification.ok) {
    return new Response(JSON.stringify({ ok: false, error: verification.error }), {
      status: verification.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let envelopeParseResult: ReturnType<typeof parseEnvelopeFromUnknown> | null = null;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    envelopeParseResult = parseEnvelopeFromUnknown(parsed, 'body');
    if (!envelopeParseResult.ok) {
      return new Response(
        JSON.stringify(buildInvalidA2AEnvelopeError({ issues: envelopeParseResult.issues })),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!envelopeParseResult || !envelopeParseResult.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid A2A envelope' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const envelope = envelopeParseResult.envelope;

  const idempotency = await checkAndStoreEnvelopeIdempotency(envelope);
  if (!idempotency.accepted) {
    return new Response(JSON.stringify({ ok: false, error: 'messageId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const intent = await handleA2AIntent(envelope);

  return new Response(
    JSON.stringify({
      ok: true,
      duplicate: idempotency.duplicate,
      messageId: envelope.messageId,
      threadId: envelope.threadId,
      intent: envelope.intent,
      intentResult: intent,
    }),
    {
      status: idempotency.duplicate ? 202 : 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
