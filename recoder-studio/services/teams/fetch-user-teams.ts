import { asc, eq } from "drizzle-orm";
import { db, authUserMappings, teamMemberships, teams } from "@/db";
import { getUser } from "@/lib/auth/user";

/**
 * fetch teams for the current user
 */
export async function fetchUserTeams() {
	const user = await getUser();

	const records = await db
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
		.innerJoin(
			authUserMappings,
			eq(teamMemberships.userDbId, authUserMappings.userDbId),
		)
		.where(eq(authUserMappings.authUserId, user.id))
		.orderBy(asc(teams.dbId));
	if (records.length === 0) {
		throw new Error("User does not have a team");
	}
	return records;
}
