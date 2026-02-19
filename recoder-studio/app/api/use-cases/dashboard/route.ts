import { NextResponse } from "next/server";
import { getUseCaseDashboardForTeam } from "@/lib/use-cases/dashboard";
import { fetchCurrentTeam } from "@/services/teams";

export async function GET() {
	const team = await fetchCurrentTeam();
	const dashboard = await getUseCaseDashboardForTeam(team.dbId);

	return NextResponse.json({
		teamId: team.id,
		readiness: dashboard.readiness,
		summary: dashboard.summary,
	});
}
