import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { extractSessionToken } from "@recoder/auth/edge";

export async function middleware(request: NextRequest) {
	try {
		const { get } = await import("@vercel/edge-config");
		const maintenance = await get("maintenance");
		if (maintenance) {
			request.nextUrl.pathname = "/maintenance";
			return NextResponse.rewrite(request.nextUrl);
		}
	} catch {
		// Edge Config not available (non-Vercel deployment)
	}

	if (request.nextUrl.pathname.startsWith("/api/")) {
		return NextResponse.next();
	}

	const rawToken = extractSessionToken(
		(name) => request.cookies.get(name)?.value ?? null,
	);
	const sessionToken = rawToken?.split(".")[0] ?? null;

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
		"/((?!_next/static|_next/image|.well-known|webhooks|legal|login|signup|join|pricing|password_reset|subscription|auth|api/vector-stores/cron|api/apps|robots\\.txt|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
