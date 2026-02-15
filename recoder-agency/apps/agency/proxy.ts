import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
	// Maintenance mode via env var
	if (process.env.MAINTENANCE_MODE === "true") {
		request.nextUrl.pathname = "/maintenance";
		return NextResponse.rewrite(request.nextUrl);
	}

	const rawToken =
		request.cookies.get("recoder.session_token")?.value ??
		request.cookies.get("__Secure-recoder.session_token")?.value;
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
		"/((?!_next/static|_next/image|.well-known|webhooks|legal|login|signup|join|pricing|password_reset|subscription|auth|api/auth|api/vector-stores/cron|api/apps|robots\\.txt|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
