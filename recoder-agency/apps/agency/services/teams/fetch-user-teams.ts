import { asc, eq } from "drizzle-orm";
import { db, teamMemberships, teams } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { fetchCurrentTeam } from "./fetch-current-team";

/**
 * fetch teams for the current user
 */
export async function fetchUserTeams() {
	const user = await getCurrentUser();
	if (!Number.isFinite(user.dbId) || user.dbId <= 0) {
		const bootstrap = await fetchCurrentTeam();
		return [bootstrap];
	}

	const fetchTeams = () =>
		db
			.select({
				id: teams.id,
				dbId: teams.dbId,
				name: teams.name,
				avatarUrl: teams.avatarUrl,
				plan: teams.plan,
				activeSubscriptionId: teams.activeSubscriptionId,
				activeCustomerId: teams.activeCustomerId,
				role: teamMemberships.role,
			})
			.from(teams)
			.innerJoin(teamMemberships, eq(teams.dbId, teamMemberships.teamDbId))
			.where(eq(teamMemberships.userDbId, user.dbId))
			.orderBy(asc(teams.dbId));

	let records = await fetchTeams();
	if (records.length === 0) {
		await fetchCurrentTeam();
		records = await fetchTeams();
	}
	return records;
}
