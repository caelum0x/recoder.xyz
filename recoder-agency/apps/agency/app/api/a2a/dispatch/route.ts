import type { RecoderA2AEnvelope } from "@recoder/shared/a2a";
import { NextResponse } from "next/server";
import { isAllowedTarget, signOutgoingA2ARequest } from "@/lib/a2a/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
	let body: { targetUrl?: string; envelope?: RecoderA2AEnvelope };
	try {
		body = (await request.json()) as { targetUrl?: string; envelope?: RecoderA2AEnvelope };
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
	}

	const targetUrl = body.targetUrl?.trim();
	const envelope = body.envelope;
	if (!targetUrl || !envelope?.messageId) {
		return NextResponse.json(
			{ ok: false, error: "targetUrl and envelope.messageId are required" },
			{ status: 400 },
		);
	}

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
