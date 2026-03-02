import { type NextRequest, NextResponse } from "next/server";
import { getSiteOrigin, isValidReturnUrl } from "@/app/(auth)/lib";
import type { OAuthProvider } from "@/services/accounts";

function isValidOAuthProvider(provider: string): provider is OAuthProvider {
	return provider === "github" || provider === "google";
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ provider: string }> },
) {
	const { searchParams } = new URL(request.url);
	const { provider: providerParam } = await params;

	if (!isValidOAuthProvider(providerParam)) {
		return new Response(`Invalid provider: ${providerParam}`, { status: 400 });
	}

	const nextParam = searchParams.get("next");
	const next = isValidReturnUrl(nextParam) ? nextParam : "/";

	const errorMessage = checkError(searchParams);
	if (errorMessage) {
		return handleRedirect(
			next,
			`authError=${encodeURIComponent(errorMessage)}`,
		);
	}

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
