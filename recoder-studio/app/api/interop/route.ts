import { NextResponse } from "next/server";

const RECODER_A2A_PROTOCOL_VERSION = "0.3.0";
const RECODER_A2A_ENVELOPE_VERSION = "2026-02-14";

function getBackendBaseUrl(): string {
	const raw = process.env.DOCKER_BACKEND_URL || "https://api.recoder.xyz";
	return raw.replace(/\/+$/, "");
}

function getAdminHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	const token =
		process.env.RECODER_A2A_ADMIN_TOKEN ||
		process.env.OPENCLAW_A2A_ADMIN_TOKEN ||
		"";
	if (token.trim()) {
		headers.authorization = `Bearer ${token.trim()}`;
	}
	return headers;
}

function toIsoNow(): string {
	return new Date().toISOString();
}

function localMessageId(): string {
	return `studio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildEnvelope(payload: Record<string, unknown>) {
	const taskText =
		typeof payload.task === "string" && payload.task.trim().length > 0
			? payload.task.trim()
			: "Run delegated task";
	const threadId =
		typeof payload.threadId === "string" && payload.threadId.trim().length > 0
			? payload.threadId.trim()
			: "studio-thread";
	const traceId =
		typeof payload.traceId === "string" && payload.traceId.trim().length > 0
			? payload.traceId.trim()
			: `trace-${Date.now()}`;
	const agentId =
		typeof payload.agentId === "string" && payload.agentId.trim().length > 0
			? payload.agentId.trim()
			: "recoder-web";

	return {
		envelopeVersion: RECODER_A2A_ENVELOPE_VERSION,
		protocolVersion: RECODER_A2A_PROTOCOL_VERSION,
		messageId: localMessageId(),
		threadId,
		createdAt: toIsoNow(),
		from: {
			id: "recoder-studio",
			name: "Recoder Studio",
			platform: "recoder_web",
		},
		to: {
			id: agentId,
			name: agentId,
			platform: "custom",
		},
		intent: "execute",
		payload: [{ kind: "text", text: taskText }],
		metadata: {
			sourceSurface: "studio",
		},
		trace: {
			traceId,
		},
	};
}

async function readJsonSafe(response: Response): Promise<Record<string, unknown> | null> {
	try {
		return (await response.json()) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const mode = searchParams.get("mode");
	const backendBase = getBackendBaseUrl();

	if (mode === "connectors") {
		const [statusRes, sessionsRes] = await Promise.all([
			fetch(`${backendBase}/api/a2a/bridge/status`, {
				method: "GET",
				headers: getAdminHeaders(),
				cache: "no-store",
			}),
			fetch(`${backendBase}/api/a2a/bridge/sessions`, {
				method: "GET",
				headers: getAdminHeaders(),
				cache: "no-store",
			}),
		]);
		const [statusJson, sessionsJson] = await Promise.all([
			readJsonSafe(statusRes),
			readJsonSafe(sessionsRes),
		]);
		return NextResponse.json({
			ok: statusRes.ok,
			status: statusJson,
			sessions: sessionsJson,
		});
	}

	const jobId = searchParams.get("jobId");
	if (jobId) {
		const response = await fetch(
			`${backendBase}/api/a2a/bridge/jobs/${encodeURIComponent(jobId)}/result`,
			{
				method: "GET",
				headers: getAdminHeaders(),
				cache: "no-store",
			},
		);
		if (response.status === 404) {
			return NextResponse.json({ ok: true, pending: true, jobId });
		}
		const data = await readJsonSafe(response);
		return NextResponse.json(
			{
				ok: response.ok,
				jobId,
				data,
			},
			{ status: response.ok ? 200 : response.status },
		);
	}

	const threadId = searchParams.get("threadId");
	const traceId = searchParams.get("traceId");
	if (threadId && traceId) {
		const response = await fetch(
			`${backendBase}/api/a2a/orchestrate/${encodeURIComponent(threadId)}/${encodeURIComponent(traceId)}/history`,
			{
				method: "GET",
				headers: getAdminHeaders(),
				cache: "no-store",
			},
		);
		const data = await readJsonSafe(response);
		return NextResponse.json(
			{
				ok: response.ok,
				threadId,
				traceId,
				data,
			},
			{ status: response.ok ? 200 : response.status },
		);
	}

	return NextResponse.json(
		{
			ok: false,
			error: "Provide mode=connectors, jobId, or threadId+traceId",
		},
		{ status: 400 },
	);
}

export async function POST(request: Request) {
	const payload = (await request.json().catch(() => ({}))) as Record<
		string,
		unknown
	>;
	const backendBase = getBackendBaseUrl();
	const envelope = buildEnvelope(payload);
	const bridgeId =
		(typeof payload.bridgeId === "string" && payload.bridgeId.trim()) ||
		process.env.RECODER_A2A_BRIDGE_ID ||
		"studio-default";
	const agentId = envelope.to.id;
	const traceId = envelope.trace.traceId;

	const response = await fetch(`${backendBase}/api/a2a/bridge/jobs`, {
		method: "POST",
		headers: getAdminHeaders(),
		body: JSON.stringify({
			bridgeId,
			agentId,
			traceId,
			envelope,
		}),
		cache: "no-store",
	});

	const data = await readJsonSafe(response);
	return NextResponse.json(
		{
			ok: response.ok,
			bridgeId,
			agentId,
			traceId,
			envelope,
			data,
		},
		{ status: response.ok ? 200 : response.status },
	);
}
