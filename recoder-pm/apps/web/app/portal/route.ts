import { NextRequest } from "next/server";
import { redirectToWorkspacePath } from "@/app/_lib/workspace-redirect";

export async function GET(request: NextRequest) {
	return redirectToWorkspacePath(request, "settings/portal");
}
