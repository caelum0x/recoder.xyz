import { createId } from "@paralleldrive/cuid2";
import { agents, db, workspaces } from "@/db";
import type { WorkspaceMetadata } from "@/db/schema";
import { fetchCurrentUser } from "@/services/accounts";
import { fetchCurrentTeam } from "@/services/teams";
import { giselle } from "../../giselle";

interface CreateTeamWorkspaceInput {
	name?: string;
	metadata?: WorkspaceMetadata;
}

type WorkspaceRecord = {
	id: string;
	name: string;
};

export async function createTeamWorkspace(input: CreateTeamWorkspaceInput = {}) {
	const agentId = `agnt_${createId()}` as const;
	const [user, team] = await Promise.all([fetchCurrentUser(), fetchCurrentTeam()]);
	const createdWorkspace = await giselle.createWorkspace();
	const workspace = (
		typeof input.name === "string" && input.name.trim().length > 0
			? await giselle.updateWorkspace({
					...createdWorkspace,
					name: input.name.trim(),
				})
			: createdWorkspace
	) as WorkspaceRecord;

	// The agents table is deprecated, so we are inserting into the workspaces table.
	await db.insert(agents).values({
		id: agentId,
		name: workspace.name,
		teamDbId: team.dbId,
		creatorDbId: user.dbId,
		workspaceId: workspace.id,
		metadata: {
			sample: false,
		},
	});
	await db.insert(workspaces).values({
		id: workspace.id,
		name: workspace.name,
		creatorDbId: user.dbId,
		teamDbId: team.dbId,
		metadata: input.metadata ?? {
			sample: false,
		},
	});

	return {
		workspaceId: workspace.id,
		redirectPath: `/workspaces/${workspace.id}`,
	};
}
