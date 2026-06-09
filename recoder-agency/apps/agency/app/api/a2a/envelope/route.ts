import type { RecoderA2AEnvelope } from "@recoder/shared/a2a";
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

	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(rawBody) as unknown;
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
	}

	const parsedEnvelope = parseEnvelopeFromUnknown(parsedBody, "body");
	if (!parsedEnvelope.ok) {
		return NextResponse.json(buildInvalidA2AEnvelopeError({ issues: parsedEnvelope.issues }), {
			status: 400,
		});
	}
	const envelope = parsedEnvelope.envelope as RecoderA2AEnvelope;

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
		{ status: idempotency.duplicate ? 202 : 200 },
	);
}
