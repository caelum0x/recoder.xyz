import { NextResponse } from "next/server";
import {
  buildInvalidA2AEnvelopeError,
  checkAndStoreEnvelopeIdempotency,
  handleA2AIntent,
  parseEnvelopeFromUnknown,
  verifyIncomingA2ARequest,
} from "@/lib/a2a/gateway";

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

  const idempotency = await checkAndStoreEnvelopeIdempotency(envelope);
  if (!idempotency.accepted) {
    return NextResponse.json({ ok: false, error: "messageId is required" }, { status: 400 });
  }
  const intent = await handleA2AIntent(envelope);

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
