import type { TeamRole } from "@/db";
import { fetchCurrentTeam } from "./fetch-current-team";

export async function requireCurrentTeamRole(
	allowedRoles: readonly TeamRole[],
): Promise<Awaited<ReturnType<typeof fetchCurrentTeam>>> {
	const team = await fetchCurrentTeam();
	if (!team.role || !allowedRoles.includes(team.role)) {
		throw new Error(
			`Unauthorized: requires one of [${allowedRoles.join(", ")}], current role is ${team.role ?? "unknown"}.`,
		);
	}
	return team;
}

export async function requireAdminRole() {
	return requireCurrentTeamRole(["admin"]);
}
