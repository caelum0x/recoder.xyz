import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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

export function middleware(request: NextRequest) {
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

	return NextResponse.next();
}

export const config = {
	matcher: "/api/:path*",
};
