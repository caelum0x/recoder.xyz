import { NextResponse } from "next/server";
import {
  type LegacyInboundEnvelope,
  validateInboundA2AEnvelope,
} from "@recoder/a2a-sdk/ingress";
import {
  buildInvalidA2AEnvelopeError,
  checkAndStoreEnvelopeIdempotency,
  handleA2AIntent,
  parseEnvelopeFromUnknown,
  verifyIncomingA2ARequest,
} from "@/lib/a2a/gateway";
import {
  PmInteropEvents,
  createPmTraceId,
  trackPmInteropEvent,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = await verifyIncomingA2ARequest({ headers: request.headers, rawBody });
  if (!verification.ok) {
    return NextResponse.json({ ok: false, error: verification.error }, { status: verification.status });
  }

  let envelopeParseResult: ReturnType<typeof parseEnvelopeFromUnknown> | null = null;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    envelopeParseResult = parseEnvelopeFromUnknown(parsed, "body");
    if (!envelopeParseResult.ok) {
      return NextResponse.json(
        buildInvalidA2AEnvelopeError({ issues: envelopeParseResult.issues }),
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!envelopeParseResult || !envelopeParseResult.ok) {
    return NextResponse.json({ ok: false, error: "Invalid A2A envelope" }, { status: 400 });
  }
  const envelope = envelopeParseResult.envelope;

  const traceId = (envelope as Record<string, unknown>).trace
    ? String(((envelope as Record<string, unknown>).trace as Record<string, unknown>).traceId ?? "")
    : createPmTraceId();
  const connectorId = String((envelope as Record<string, unknown>).from
    ? ((envelope as Record<string, unknown>).from as Record<string, unknown>).id ?? "unknown"
    : "unknown");

  // Validate against the shared canonical A2A contract (recoder-9s5j) before
  // idempotency/intent dispatch. The legacy camelCase wire shape is adapted onto
  // the canonical TaskEnvelope and normalized; on failure we return the canonical
  // A2AError from the shared taxonomy instead of a surface-local error shape.
  const workspaceId = String(
    (envelope.metadata?.workspaceId as string | undefined) ?? envelope.threadId,
  );
  const validation = validateInboundA2AEnvelope(envelope as unknown as LegacyInboundEnvelope, {
    workspaceId,
  });
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }

  trackPmInteropEvent(PmInteropEvents.CONNECTOR_INVOKED, {
    connector_id: connectorId,
    traceId,
    intent: String(envelope.intent),
    messageId: String(envelope.messageId),
    threadId: String(envelope.threadId),
    fromPlatform: String((envelope as Record<string, unknown>).from
      ? ((envelope as Record<string, unknown>).from as Record<string, unknown>).platform ?? ""
      : ""),
    toPlatform: "recoder_pm",
  });

  const idempotency = await checkAndStoreEnvelopeIdempotency(envelope);
  if (!idempotency.accepted) {
    return NextResponse.json({ ok: false, error: "messageId is required" }, { status: 400 });
  }

  const intentStart = Date.now();
  const intent = await handleA2AIntent(envelope);
  const durationMs = Date.now() - intentStart;

  if (intent.handled) {
    trackPmInteropEvent(PmInteropEvents.CONNECTOR_RESPONSE, {
      connector_id: connectorId,
      traceId,
      intent: String(envelope.intent),
      messageId: String(envelope.messageId),
      threadId: String(envelope.threadId),
      responseStatus: idempotency.duplicate ? 202 : 200,
      durationMs,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      duplicate: idempotency.duplicate,
      messageId: envelope.messageId,
      threadId: envelope.threadId,
      intent: envelope.intent,
      intentResult: intent,
    },
    { status: idempotency.duplicate ? 202 : 200 }
  );
}
