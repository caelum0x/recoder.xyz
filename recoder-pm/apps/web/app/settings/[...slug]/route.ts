import { NextRequest } from "next/server";
import { redirectToWorkspacePath } from "@/app/_lib/workspace-redirect";

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ slug: string[] }> },
) {
	const { slug } = await context.params;
	return redirectToWorkspacePath(request, `settings/${slug.join("/")}`);
}
