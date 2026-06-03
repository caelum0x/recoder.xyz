import type { RecoderA2AEnvelope } from "@recoder/shared/a2a";
import { NextResponse } from "next/server";
import {
	buildInvalidA2AEnvelopeError,
	isAllowedTarget,
	parseEnvelopeFromUnknown,
	signOutgoingA2ARequest,
} from "@/lib/a2a/gateway";

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
		return NextResponse.json(buildInvalidA2AEnvelopeError({ issues: parsedEnvelope.issues }), {
			status: 400,
		});
	}
	const envelope = parsedEnvelope.envelope as RecoderA2AEnvelope;

	if (!isAllowedTarget(targetUrl)) {
		return NextResponse.json({ ok: false, error: "targetUrl not in egress allowlist" }, { status: 403 });
	}

	const rawBody = JSON.stringify(envelope);
	const signed = await signOutgoingA2ARequest(rawBody);
	const senderAgent = process.env.RECODER_A2A_AGENT_ID || "recoder-agency";

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

	if (!response.ok) {
		const responseBody = await response.text();
		console.error("[a2a/dispatch] Target returned error:", response.status, responseBody.slice(0, 500));
	}

	return NextResponse.json(
		{
			ok: response.ok,
			status: response.status,
		},
		{ status: response.ok ? 200 : 502 },
	);
}
