import { generateInitialWorkspace, Workspace } from "@recoder/protocol";
import type { GiselleContext } from "../types";
import { setWorkspace } from "./utils";

export async function createWorkspace(args: { context: GiselleContext }) {
	const workspace = generateInitialWorkspace();
	await setWorkspace({
		workspaceId: workspace.id,
		workspace: Workspace.parse(workspace),
		context: args.context,
	});
	return workspace;
}
