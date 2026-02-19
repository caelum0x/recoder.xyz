import { updateRecoderStudioSession } from "@/lib/recoder-studio-session";
import { fetchUserTeams } from "./";

export async function setCurrentTeam(teamId: string) {
	const teams = await fetchUserTeams();
	if (teams.length === 0) {
		throw new Error("No teams found");
	}
	let team = teams.find((t) => t.id === teamId);
	if (team == null) {
		// fallback to the first team
		team = teams[0];
	}
	await updateRecoderStudioSession({ teamId: team.id });
}
