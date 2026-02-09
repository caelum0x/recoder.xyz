import { and, eq, inArray, sql } from "drizzle-orm";
import {
	db,
	type ProjectStatus,
	projects,
	teamCapacitySettings,
	users,
} from "@/db";

export type MemberLoad = {
	userDbId: number;
	displayName: string | null;
	email: string | null;
	activeProjectCount: number;
	isOverLimit: boolean;
};

export type TeamCapacitySnapshot = {
	maxConcurrentProjects: number;
	maxConcurrentPerMember: number;
	activeProjectCount: number;
	memberLoads: MemberLoad[];
	isTeamOverLimit: boolean;
};

const ACTIVE_STATUSES: ProjectStatus[] = [
	"in_progress",
	"qa",
	"client_review",
	"blocked",
];

export async function getTeamCapacitySnapshot(
	teamDbId: number,
): Promise<TeamCapacitySnapshot> {
	const settings = await db.query.teamCapacitySettings.findFirst({
		where: eq(teamCapacitySettings.teamDbId, teamDbId),
	});

	const maxConcurrentProjects = settings?.maxConcurrentProjects ?? 10;
	const maxConcurrentPerMember = settings?.maxConcurrentPerMember ?? 3;

	const activeProjects = await db
		.select({
			dbId: projects.dbId,
			assignedUserDbId: projects.assignedUserDbId,
		})
		.from(projects)
		.where(
			and(
				eq(projects.teamDbId, teamDbId),
				inArray(projects.status, ACTIVE_STATUSES),
			),
		);

	const activeProjectCount = activeProjects.length;

	const memberMap = new Map<number, number>();
	for (const project of activeProjects) {
		if (project.assignedUserDbId != null) {
			memberMap.set(
				project.assignedUserDbId,
				(memberMap.get(project.assignedUserDbId) ?? 0) + 1,
			);
		}
	}

	const memberLoads: MemberLoad[] = [];
	if (memberMap.size > 0) {
		const memberDbIds = [...memberMap.keys()];
		const memberRows = await db
			.select({
				dbId: users.dbId,
				displayName: users.displayName,
				email: users.email,
			})
			.from(users)
			.where(inArray(users.dbId, memberDbIds));

		for (const member of memberRows) {
			const count = memberMap.get(member.dbId) ?? 0;
			memberLoads.push({
				userDbId: member.dbId,
				displayName: member.displayName,
				email: member.email,
				activeProjectCount: count,
				isOverLimit: count > maxConcurrentPerMember,
			});
		}

		memberLoads.sort((a, b) => b.activeProjectCount - a.activeProjectCount);
	}

	return {
		maxConcurrentProjects,
		maxConcurrentPerMember,
		activeProjectCount,
		memberLoads,
		isTeamOverLimit: activeProjectCount > maxConcurrentProjects,
	};
}

export async function updateTeamCapacitySettings(
	teamDbId: number,
	settings: {
		maxConcurrentProjects: number;
		maxConcurrentPerMember: number;
	},
) {
	await db
		.insert(teamCapacitySettings)
		.values({
			teamDbId,
			maxConcurrentProjects: settings.maxConcurrentProjects,
			maxConcurrentPerMember: settings.maxConcurrentPerMember,
		})
		.onConflictDoUpdate({
			target: teamCapacitySettings.teamDbId,
			set: {
				maxConcurrentProjects: settings.maxConcurrentProjects,
				maxConcurrentPerMember: settings.maxConcurrentPerMember,
			},
		});
}
