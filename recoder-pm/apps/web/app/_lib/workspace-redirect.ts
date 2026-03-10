import { NextRequest, NextResponse } from "next/server";

function hasRecoderSession(request: NextRequest): boolean {
	return (
		request.cookies.has("recoder.session_token") ||
		request.cookies.has("__Secure-recoder.session_token")
	);
}

function resolveWorkspaceBaseUrl(): URL {
	const configured =
		process.env.RECODER_PM_APP_URL ||
		process.env.RECODER_PM_WORKSPACE_URL ||
		process.env.RECODER_PM_WEB_URL ||
		"https://pm.recoder.xyz";

	try {
		return new URL(configured);
	} catch {
		return new URL("https://pm.recoder.xyz");
	}
}

export function redirectToWorkspacePath(
	request: NextRequest,
	pathSuffix: string,
): NextResponse {
	if (!hasRecoderSession(request)) {
		const incoming = new URL(request.url);
		const signinUrl = new URL("https://recoder.xyz/auth/signin");
		signinUrl.searchParams.set("callbackUrl", incoming.toString());
		return NextResponse.redirect(signinUrl);
	}

	const target = resolveWorkspaceBaseUrl();
	const incoming = new URL(request.url);
	const normalizedSuffix = pathSuffix.replace(/^\/+/, "");
	const basePath = target.pathname.replace(/\/$/, "");
	target.pathname = normalizedSuffix
		? `${basePath}/${normalizedSuffix}`
		: basePath || "/";
	target.search = incoming.search;
	return NextResponse.redirect(target);
}
