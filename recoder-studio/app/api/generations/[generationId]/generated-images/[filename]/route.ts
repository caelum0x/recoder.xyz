import { GenerationId } from "@recoder/protocol";
import type { NextRequest } from "next/server";
import { giselle } from "@/app/giselle";
import { getUser } from "@/lib/auth/user";

const SAFE_FILENAME_RE = /^[a-zA-Z0-9_\-][a-zA-Z0-9_\-. ]{0,254}$/;

export async function GET(
	_request: NextRequest,
	{
		params,
	}: {
		params: Promise<{
			generationId: string;
			filename: string;
		}>;
	},
) {
	try {
		await getUser();
	} catch {
		return new Response("Unauthorized", { status: 401 });
	}

	const { generationId, filename } = await params;

	if (
		!SAFE_FILENAME_RE.test(filename) ||
		filename.includes("..") ||
		filename.includes("/") ||
		filename.includes("\\")
	) {
		return new Response("Invalid filename", { status: 400 });
	}

	const file = await giselle.getGeneratedImage(
		GenerationId.parse(generationId),
		filename,
	);
	return new Response(file, {
		headers: {
			"Content-Type": file.type,
			"Content-Disposition": `inline; filename="${file.name}"`,
		},
	});
}
