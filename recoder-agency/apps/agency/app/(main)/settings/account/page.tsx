import { Plus } from "lucide-react";
import { headers } from "next/headers";
import { GlassButton } from "@/components/ui/glass-button";
import { fetchSubscriptionStatus } from "@/lib/cross-app-billing";
import { fetchCurrentUser } from "@/services/accounts";
import { fetchUserTeams } from "@/services/teams";
import TeamCreation from "@/services/teams/components/team-creation";
import { isProPlan } from "@/services/teams/utils";
import UserTeams from "./user-teams";

export default async function AccountSettingPage() {
	const headersList = await headers();
	const subscriptionStatus = await fetchSubscriptionStatus(
		headersList.get("cookie") ?? undefined,
	);
	const teams = await fetchUserTeams();

	// Add isPro information to each team
	const teamsWithProInfo = teams.map((team) => ({
		id: team.id,
		name: team.name,
		role: team.role ?? ("member" as const),
		avatarUrl: team.avatarUrl,
		plan: team.plan,
		isPro: isProPlan(team),
	}));

	const currentUser = await fetchCurrentUser();

	return (
		<div className="flex flex-col gap-[12px]">
			{subscriptionStatus && (
				<div className="mb-6 p-4 rounded-lg border border-border bg-surface/5">
					<h3 className="text-sm font-medium text-text mb-1">Platform Subscription</h3>
					<p className="text-sm text-text-muted">
						Plan: <span className="font-medium text-text">{subscriptionStatus.plan}</span>
						{subscriptionStatus.active && (
							<span className="ml-2 text-xs px-2 py-0.5 bg-green-500/10 text-green-500 rounded-full">Active</span>
						)}
					</p>
				</div>
			)}
			<div className="flex flex-col gap-y-[12px]">
				<div className="space-y-2 gap-y-[12px]">
					<div className="flex justify-between items-center">
						<div>
							<h4 className="text-text text-[18px] font-medium font-sans">
								Teams
							</h4>
							<p className="text-link-muted text-[12px] font-sans">
								The teams that are associated with your Recoder Agency account.
							</p>
						</div>
						<div className="grid placeitems-center">
							<TeamCreation>
								<GlassButton type="button">
									<span className="grid size-4 place-items-center rounded-full bg-primary-200 opacity-50">
										<Plus className="size-3 text-background" />
									</span>
									<span className="text-[14px] font-medium leading-[20px]">
										Create New Team
									</span>
								</GlassButton>
							</TeamCreation>
						</div>
					</div>
					<UserTeams
						teams={teamsWithProInfo}
						currentUser={{ id: currentUser.id }}
					/>
				</div>
			</div>
		</div>
	);
}
