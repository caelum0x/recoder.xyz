import { getCurrentUser } from "@/lib/get-current-user";
import { isEmailFromRoute06 } from "@/lib/utils";
import { fetchUserTeams } from "../fetch-user-teams";
import { TeamCreationForm } from "./team-creation-form";

export default async function TeamCreation({
	children,
}: {
	children?: React.ReactNode;
}) {
	const user = await getCurrentUser();
	const isInternalUser = user.email != null && isEmailFromRoute06(user.email);
	const teams = await fetchUserTeams();
	const hasExistingFreeTeam = teams.some((team) => team.plan === "free");

	// Pro plan price is now managed via Polar.sh product configuration
	const proPlanPrice = "$20/mo";

	return (
		<TeamCreationForm
			canCreateFreeTeam={!isInternalUser && !hasExistingFreeTeam}
			proPlanPrice={proPlanPrice}
		>
			{children}
		</TeamCreationForm>
	);
}
