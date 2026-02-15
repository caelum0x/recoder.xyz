import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import {
  buildInvalidA2AEnvelopeError,
  parseEnvelopeFromUnknown,
  signOutgoingA2ARequest,
} from '~/lib/.server/a2a-gateway';

function isAllowedTarget(targetUrl: string): boolean {
  const allowListRaw = process.env.RECODER_A2A_EGRESS_ALLOWLIST || '';
  const allowList = allowListRaw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowList.length === 0) return true;
  return allowList.some((allowedPrefix) => targetUrl.startsWith(allowedPrefix));
}

export async function action({ request }: ActionFunctionArgs) {
  let body: { targetUrl?: string; envelope?: unknown };
  try {
    body = (await request.json()) as { targetUrl?: string; envelope?: unknown };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const targetUrl = body.targetUrl?.trim();
  if (!targetUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'targetUrl is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const parsedEnvelope = parseEnvelopeFromUnknown(body.envelope, 'envelope');
  if (!parsedEnvelope.ok) {
    return new Response(
      JSON.stringify(buildInvalidA2AEnvelopeError({ issues: parsedEnvelope.issues })),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
  const envelope = parsedEnvelope.envelope;

  if (!isAllowedTarget(targetUrl)) {
    return new Response(JSON.stringify({ ok: false, error: 'targetUrl not in egress allowlist' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawBody = JSON.stringify(envelope);
  const signed = await signOutgoingA2ARequest(rawBody);
  const senderAgent = process.env.RECODER_A2A_AGENT_ID || 'recoder-web';

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-recoder-a2a-agent-id': senderAgent,
      'x-recoder-a2a-timestamp': signed.timestamp,
      'x-recoder-a2a-signature': signed.signature,
    },
    body: rawBody,
  });

  const responseBody = await response.text();
  return new Response(
    JSON.stringify({
      ok: response.ok,
      status: response.status,
      targetUrl,
      responseBody,
    }),
    {
      status: response.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
