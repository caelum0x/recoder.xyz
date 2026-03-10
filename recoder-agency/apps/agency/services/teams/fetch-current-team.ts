import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";
import { db, teamMemberships, teams } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { getGiselleSession } from "@/lib/giselle-session";
import { isEmailFromRoute06 } from "@/lib/utils";
import type { CurrentTeam, TeamId } from "./types";
import { createTeamId } from "./utils";

function createBootstrapTeam(user: {
	dbId: number;
	email?: string | null;
}): CurrentTeam {
	return {
		id: "tm_bootstrap" as TeamId,
		dbId: user.dbId,
		name: "My Project",
		avatarUrl: null,
		role: "admin",
		plan: isEmailFromRoute06(user.email ?? "") ? "internal" : "free",
		activeSubscriptionId: null,
		activeCustomerId: null,
	};
}

/**
 * Fetches the current team of the user.
 * This function uses session to get the teamId.
 * If the user does not have a team, the first team is returned.
 */
async function fetchCurrentTeam(): Promise<CurrentTeam> {
	const user = await getCurrentUser();
	// Signed-in fallback mode: auth is valid but agency-local profile/team tables
	// are not provisioned yet. Avoid hard 500 and return a synthetic free team.
	if (!Number.isFinite(user.dbId) || user.dbId <= 0) {
		return createBootstrapTeam({
			dbId: user.dbId,
			email: user.email,
		});
	}

	const session = await getGiselleSession();
	const teamId = session?.teamId;

	if (teamId == null) {
		return fetchFirstTeam(user.dbId, user.email);
	}

	const team = await fetchTeam(teamId, user.dbId);
	if (team == null) {
		// fallback to first team
		return fetchFirstTeam(user.dbId, user.email);
	}
	return team;
}

const cachedFetchCurrentTeam = cache(fetchCurrentTeam);
export { cachedFetchCurrentTeam as fetchCurrentTeam };

async function fetchTeam(teamId: TeamId, userDbId: number) {
	const result = await db
		.select({
			id: teams.id,
			dbId: teams.dbId,
			name: teams.name,
			avatarUrl: teams.avatarUrl,
			role: teamMemberships.role,
			plan: teams.plan,
			activeSubscriptionId: teams.activeSubscriptionId,
			activeCustomerId: teams.activeCustomerId,
		})
		.from(teams)
		.innerJoin(teamMemberships, eq(teams.dbId, teamMemberships.teamDbId))
		.where(and(eq(teamMemberships.userDbId, userDbId), eq(teams.id, teamId)));
	if (result.length === 0) {
		return null;
	}
	return result[0];
}

async function fetchFirstTeam(userDbId: number, userEmail?: string | null) {
	const team = await db
		.select({
			id: teams.id,
			dbId: teams.dbId,
			name: teams.name,
			avatarUrl: teams.avatarUrl,
			role: teamMemberships.role,
			plan: teams.plan,
			activeSubscriptionId: teams.activeSubscriptionId,
			activeCustomerId: teams.activeCustomerId,
		})
		.from(teams)
		.innerJoin(teamMemberships, eq(teams.dbId, teamMemberships.teamDbId))
		.where(eq(teamMemberships.userDbId, userDbId))
		.orderBy(asc(teams.dbId))
		.limit(1);

	if (team.length === 0) {
		return createDefaultTeam(userDbId, userEmail);
	}
	return team[0];
}

async function createDefaultTeam(userDbId: number, userEmail?: string | null) {
	const [existingTeam] = await db
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
		.where(eq(teamMemberships.userDbId, userDbId))
		.orderBy(asc(teams.dbId))
		.limit(1);

	if (existingTeam) {
		return existingTeam;
	}

	const [createdTeam] = await db
		.insert(teams)
		.values({
			id: createTeamId(),
			name: "My Project",
			plan: isEmailFromRoute06(userEmail ?? "") ? "internal" : "free",
		})
		.returning({
			id: teams.id,
			dbId: teams.dbId,
			name: teams.name,
			avatarUrl: teams.avatarUrl,
			plan: teams.plan,
			activeSubscriptionId: teams.activeSubscriptionId,
			activeCustomerId: teams.activeCustomerId,
		});

	await db.insert(teamMemberships).values({
		userDbId,
		teamDbId: createdTeam.dbId,
		role: "admin",
	});

	return {
		...createdTeam,
		role: "admin" as const,
	};
}
