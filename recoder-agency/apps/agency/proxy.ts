import { type NextRequest, NextResponse } from "next/server";
import { extractSessionToken, parseSessionToken } from "@recoder/auth/edge";

const DEFAULT_BODY_LIMIT = 1 * 1024 * 1024; // 1 MB
const UPLOAD_BODY_LIMIT = 5 * 1024 * 1024; // 5 MB

const UPLOAD_PATHS = ["/api/apps/", "/api/vector-stores/document"];

function getBodyLimit(pathname: string): number {
	for (const prefix of UPLOAD_PATHS) {
		if (pathname.startsWith(prefix)) {
			return UPLOAD_BODY_LIMIT;
		}
	}
	return DEFAULT_BODY_LIMIT;
}

function checkBodyLimit(request: NextRequest): NextResponse | null {
	if (
		request.method === "POST" ||
		request.method === "PUT" ||
		request.method === "PATCH"
	) {
		const contentLength = request.headers.get("content-length");
		if (contentLength) {
			const size = Number.parseInt(contentLength, 10);
			const limit = getBodyLimit(request.nextUrl.pathname);
			if (Number.isFinite(size) && size > limit) {
				return NextResponse.json(
					{ error: "Request body too large" },
					{ status: 413 },
				);
			}
		}
	}
	return null;
}

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const nextActionId = request.headers.get("next-action");

	// Reduce noisy Next.js errors from malformed action probes.
	if (request.method === "POST" && nextActionId) {
		const isPlausibleActionId = /^[A-Za-z0-9_-]{20,}$/.test(nextActionId);
		if (!isPlausibleActionId) {
			return NextResponse.json({ error: "Invalid Server Action id" }, { status: 400 });
		}
	}

	// Maintenance mode via env var
	if (process.env.MAINTENANCE_MODE === "true") {
		request.nextUrl.pathname = "/maintenance";
		return NextResponse.rewrite(request.nextUrl);
	}

	// Body size limit for API routes
	if (pathname.startsWith("/api/")) {
		const limitResponse = checkBodyLimit(request);
		if (limitResponse) return limitResponse;
		return NextResponse.next();
	}

	// Auth check for non-API routes
	const rawToken = extractSessionToken(
		(name) => request.cookies.get(name)?.value ?? null,
	);
	const sessionToken = rawToken ? parseSessionToken(rawToken) : null;

	if (!sessionToken) {
		const url = request.nextUrl.clone();
		const returnUrl = request.nextUrl.pathname + request.nextUrl.search;
		url.pathname = "/login";
		url.searchParams.set("returnUrl", returnUrl);
		return NextResponse.redirect(url);
	}

	return NextResponse.next({ request });
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|.well-known|webhooks|legal|login|signup|join|pricing|password_reset|subscription|auth|api/auth|api/vector-stores/cron|robots\\.txt|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
