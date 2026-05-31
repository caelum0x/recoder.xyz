import {
	buildInvalidA2AEnvelopeErrorResponse,
	type RecoderA2AEnvelope,
	validateRecoderA2AEnvelope,
} from "@recoder/shared/a2a/ingress";
import { NextResponse } from "next/server";
import {
	checkAndStoreEnvelopeIdempotency,
	handleA2AIntent,
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

	let envelope: RecoderA2AEnvelope;
	try {
		envelope = JSON.parse(rawBody) as RecoderA2AEnvelope;
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
	}

	// Normalize against the shared A2A contract before persistence or dispatch
	// (recoder-9s5j). Imported via the crypto-free ingress subpath (Turbopack-safe).
	const validationIssues = validateRecoderA2AEnvelope(envelope);
	if (validationIssues.length > 0) {
		return NextResponse.json(
			buildInvalidA2AEnvelopeErrorResponse({ issues: validationIssues }),
			{ status: 400 },
		);
	}

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
