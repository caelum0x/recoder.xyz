import { type NextRequest, NextResponse } from "next/server";

/**
 * @deprecated Password reset confirmation is no longer available with magic link authentication.
 * Redirects to the login page.
 */
// biome-ignore lint/suspicious/useAwait: Route handler convention
export async function GET(request: NextRequest) {
	const redirectTo = request.nextUrl.clone();
	redirectTo.pathname = "/login";
	return NextResponse.redirect(redirectTo);
}
