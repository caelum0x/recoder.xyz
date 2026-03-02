import { NextResponse } from "next/server";
import {
  buildInvalidA2AEnvelopeError,
  isAllowedTarget,
  parseEnvelopeFromUnknown,
  signOutgoingA2ARequest,
} from "@/lib/a2a/gateway";
import {
  PmInteropEvents,
  createPmTraceId,
  trackPmInteropEvent,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { targetUrl?: string; envelope?: unknown };
  try {
    body = (await request.json()) as { targetUrl?: string; envelope?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const targetUrl = body.targetUrl?.trim();
  if (!targetUrl) {
    return NextResponse.json({ ok: false, error: "targetUrl is required" }, { status: 400 });
  }

  const parsedEnvelope = parseEnvelopeFromUnknown(body.envelope, "envelope");
  if (!parsedEnvelope.ok) {
    return NextResponse.json(
      buildInvalidA2AEnvelopeError({ issues: parsedEnvelope.issues }),
      { status: 400 }
    );
  }
  const envelope = parsedEnvelope.envelope;

  if (!isAllowedTarget(targetUrl)) {
    return NextResponse.json({ ok: false, error: "targetUrl not in egress allowlist" }, { status: 403 });
  }

  const traceId = (envelope as Record<string, unknown>).trace
    ? String(((envelope as Record<string, unknown>).trace as Record<string, unknown>).traceId ?? "")
    : createPmTraceId();
  const connectorId = String((envelope as Record<string, unknown>).to
    ? ((envelope as Record<string, unknown>).to as Record<string, unknown>).id ?? "unknown"
    : "unknown");

  trackPmInteropEvent(PmInteropEvents.CONNECTOR_INVOKED, {
    connector_id: connectorId,
    traceId,
    intent: String(envelope.intent),
    messageId: String(envelope.messageId),
    threadId: String(envelope.threadId),
    targetUrl,
    fromPlatform: String((envelope as Record<string, unknown>).from
      ? ((envelope as Record<string, unknown>).from as Record<string, unknown>).platform ?? ""
      : ""),
    toPlatform: String((envelope as Record<string, unknown>).to
      ? ((envelope as Record<string, unknown>).to as Record<string, unknown>).platform ?? ""
      : ""),
  });

  const rawBody = JSON.stringify(envelope);
  const signed = await signOutgoingA2ARequest(rawBody);
  const senderAgent = process.env.RECODER_A2A_AGENT_ID || "recoder-pm-api";

  const dispatchStart = Date.now();
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-recoder-a2a-agent-id": senderAgent,
      "x-recoder-a2a-timestamp": signed.timestamp,
      "x-recoder-a2a-signature": signed.signature,
    },
    body: rawBody,
  });
  const durationMs = Date.now() - dispatchStart;

  if (response.ok) {
    trackPmInteropEvent(PmInteropEvents.CONNECTOR_RESPONSE, {
      connector_id: connectorId,
      traceId,
      intent: String(envelope.intent),
      messageId: String(envelope.messageId),
      threadId: String(envelope.threadId),
      responseStatus: response.status,
      durationMs,
    });
  } else {
    const responseBody = await response.text();
    console.error("[a2a/dispatch] Target returned error:", response.status, responseBody);
    trackPmInteropEvent(PmInteropEvents.CONNECTOR_ERROR, {
      connector_id: connectorId,
      traceId,
      intent: String(envelope.intent),
      messageId: String(envelope.messageId),
      threadId: String(envelope.threadId),
      responseStatus: response.status,
      errorMessage: responseBody.slice(0, 500),
      durationMs,
    });
  }

  return NextResponse.json(
    {
      ok: response.ok,
      status: response.status,
    },
    { status: response.ok ? 200 : 502 }
  );
}
