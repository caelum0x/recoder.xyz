import type { RecoderA2AEnvelope } from "@recoder/shared/a2a";
import { NextResponse } from "next/server";
import {
	type LegacyInboundEnvelope,
	validateInboundA2AEnvelope,
} from "recoder-a2a-sdk/ingress";
import {
	checkAndStoreEnvelopeIdempotency,
	handleA2AIntent,
	verifyIncomingA2ARequest,
} from "@/lib/a2a/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveWorkspaceId(envelope: RecoderA2AEnvelope): string {
	const fromMetadata = envelope.metadata?.workspaceId;
	if (typeof fromMetadata === "string" && fromMetadata.trim().length > 0) {
		return fromMetadata.trim();
	}
	// Legacy envelopes carry no workspace_id; the thread is the conversation scope.
	return envelope.threadId;
}

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

	// Validate against the shared canonical A2A contract (recoder-9s5j) before
	// idempotency/intent dispatch. The legacy camelCase wire shape is adapted onto
	// the canonical TaskEnvelope and normalized; on failure we return the canonical
	// A2AError from the shared taxonomy instead of a surface-local error shape.
	const validation = validateInboundA2AEnvelope(envelope as LegacyInboundEnvelope, {
		workspaceId: resolveWorkspaceId(envelope),
	});
	if (!validation.ok) {
		return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
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
