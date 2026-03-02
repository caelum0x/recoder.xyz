import { NextResponse } from "next/server";

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

/**
 * PATCH /api/interop/approvals
 *
 * Resolves an approval request (approve / deny).
 * Proxies to the backend A2A approval endpoint.
 */
export async function PATCH(request: Request) {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const approvalId = body.approvalId;
		const verdict = body.verdict;

		if (
			typeof approvalId !== "string" ||
			!approvalId.trim() ||
			(verdict !== "approved" && verdict !== "denied")
		) {
			return NextResponse.json(
				{ ok: false, error: "approvalId and verdict (approved|denied) required" },
				{ status: 400 },
			);
		}

		const backendBase = getBackendBaseUrl();
		const response = await fetch(
			`${backendBase}/api/a2a/approvals/${encodeURIComponent(approvalId.trim())}`,
			{
				method: "PATCH",
				headers: getAdminHeaders(),
				body: JSON.stringify({ verdict }),
				cache: "no-store",
			},
		);

		const data = await response.json().catch(() => null);
		return NextResponse.json(
			{ ok: response.ok, data },
			{ status: response.ok ? 200 : response.status },
		);
	} catch (e) {
		return NextResponse.json(
			{
				ok: false,
				error: e instanceof Error ? e.message : "Internal error",
			},
			{ status: 500 },
		);
	}
}
