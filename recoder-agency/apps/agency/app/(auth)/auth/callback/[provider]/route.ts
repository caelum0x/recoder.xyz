import { type NextRequest, NextResponse } from "next/server";
import { getSiteOrigin, isValidReturnUrl } from "@/app/(auth)/lib";
import type { OAuthProvider } from "@/services/accounts";

/**
 * Locale prefixes from the main recoder.xyz app (next-intl).
 * The agency app has no locale routing, so these must be stripped
 * from any redirect path to avoid 404s.
 */
const LOCALE_PREFIXES = ["/en/", "/tr/", "/es/", "/zh/", "/de/"];

function stripLocalePrefix(path: string): string {
	for (const prefix of LOCALE_PREFIXES) {
		if (path.startsWith(prefix)) {
			return `/${path.slice(prefix.length)}`;
		}
	}
	// Also handle bare locale paths like "/tr" -> "/"
	for (const prefix of LOCALE_PREFIXES) {
		if (path === prefix.slice(0, -1)) {
			return "/";
		}
	}
	return path;
}

function isValidOAuthProvider(provider: string): provider is OAuthProvider {
	return provider === "github" || provider === "google";
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ provider: string }> },
) {
	const { searchParams } = new URL(request.url);
	const { provider: providerParam } = await params;

	// Validate provider parameter
	if (!isValidOAuthProvider(providerParam)) {
		return new Response(`Invalid provider: ${providerParam}`, { status: 400 });
	}
	const _provider: OAuthProvider = providerParam;

	// Get and validate the redirect URL to prevent open redirects.
	// Strip any locale prefix (e.g. /tr/) that may have leaked from
	// the main recoder.xyz app's intl middleware.
	const nextParam = searchParams.get("next");
	const rawNext = isValidReturnUrl(nextParam) ? nextParam : "/";
	const next = stripLocalePrefix(rawNext);

	// Check for authentication errors
	const errorMessage = checkError(searchParams);
	if (errorMessage) {
		return handleRedirect(
			next,
			`authError=${encodeURIComponent(errorMessage)}`,
		);
	}

	// Better Auth handles the session creation via the catch-all route.
	// This callback route handles post-login tasks like user initialization
	// and storing provider tokens.
	// The session cookie is already set by Better Auth at this point.

	// Success redirect
	return handleRedirect(next);
}

function checkError(searchParams: URLSearchParams) {
	const error = searchParams.get("error");
	if (error) {
		const errorDescription = searchParams.get("error_description");
		const errorCode = searchParams.get("error_code");
		return `Error occurred: ${errorCode} - ${errorDescription}`;
	}
	return "";
}

function handleRedirect(path: string, queryString?: string) {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const redirectPath = queryString
		? `${normalizedPath}?${queryString}`
		: normalizedPath;
	return NextResponse.redirect(`${getSiteOrigin()}${redirectPath}`);
}
