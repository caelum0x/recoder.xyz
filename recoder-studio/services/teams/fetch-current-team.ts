import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";
import { db, authUserMappings, teamMemberships, teams } from "@/db";
import { getRecoderStudioSession } from "@/lib/recoder-studio-session";
import { getUser } from "@/lib/auth/user";
import type { CurrentTeam, TeamId } from "./types";

/**
 * Fetches the current team of the user.
 * This function uses session to get the teamId.
 * If the user does not have a team, the first team is returned.
 */
async function fetchCurrentTeam(): Promise<CurrentTeam> {
	const supabaseUser = await getUser();
	const session = await getRecoderStudioSession();
	const teamId = session?.teamId;

	if (teamId == null) {
		return fetchFirstTeam(supabaseUser.id);
	}

	const team = await fetchTeam(teamId, supabaseUser.id);
	if (team == null) {
		// fallback to first team
		return fetchFirstTeam(supabaseUser.id);
	}
	return team;
}

const cachedFetchCurrentTeam = cache(fetchCurrentTeam);
export { cachedFetchCurrentTeam as fetchCurrentTeam };

async function fetchTeam(teamId: TeamId, authUserId: string) {
	const result = await db
		.select({
			id: teams.id,
			dbId: teams.dbId,
			name: teams.name,
			avatarUrl: teams.avatarUrl,
			plan: teams.plan,
			activeSubscriptionId: teams.activeSubscriptionId,
			activeCustomerId: teams.activeCustomerId,
		})
		.from(teams)
		// join teamMemberships and authUserMappings to check user's membership
		.innerJoin(teamMemberships, eq(teams.dbId, teamMemberships.teamDbId))
		.innerJoin(
			authUserMappings,
			eq(teamMemberships.userDbId, authUserMappings.userDbId),
		)
		.where(
			and(
				eq(authUserMappings.authUserId, authUserId),
				eq(teams.id, teamId),
			),
		);
	if (result.length === 0) {
		return null;
	}
	return result[0];
}

async function fetchFirstTeam(authUserId: string) {
	const team = await db
		.select({
			id: teams.id,
			dbId: teams.dbId,
			name: teams.name,
			avatarUrl: teams.avatarUrl,
			plan: teams.plan,
			activeSubscriptionId: teams.activeSubscriptionId,
			activeCustomerId: teams.activeCustomerId,
		})
		.from(teams)
		.innerJoin(teamMemberships, eq(teams.dbId, teamMemberships.teamDbId))
		.innerJoin(
			authUserMappings,
			eq(teamMemberships.userDbId, authUserMappings.userDbId),
		)
		.where(eq(authUserMappings.authUserId, authUserId))
		.orderBy(asc(teams.dbId))
		.limit(1);

	if (team.length === 0) {
		throw new Error("User does not have a team");
	}
	return team[0];
}
