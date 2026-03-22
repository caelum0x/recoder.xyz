import { existsSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { NextResponse } from "next/server";

const STORAGE_DIR = process.env.AGENCY_STORAGE_DIR || "/root/recoder.xyz/data/agency-storage";

const MIME_TYPES: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".pdf": "application/pdf",
};

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const { path: pathSegments } = await params;
	const filePath = join(STORAGE_DIR, ...pathSegments);

	// Prevent directory traversal
	if (!filePath.startsWith(STORAGE_DIR)) {
		return new NextResponse("Forbidden", { status: 403 });
	}

	if (!existsSync(filePath)) {
		return new NextResponse("Not found", { status: 404 });
	}

	const ext = extname(filePath).toLowerCase();
	const contentType = MIME_TYPES[ext] || "application/octet-stream";
	const data = readFileSync(filePath);

	return new NextResponse(data, {
		headers: {
			"Content-Type": contentType,
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
}
