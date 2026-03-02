import { DocsLink } from "@recoder-internal/ui/docs-link";
import { PageHeading } from "@recoder-internal/ui/page-heading";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCurrentTeam, isProPlan } from "@/services/teams";
import { AgentTimeCharge } from "../agent-time-charge";
import { AgentUsage } from "../agent-usage";

export default async function TeamUsagePage() {
	const currentTeam = await fetchCurrentTeam();
	const currentTeamIsFreePlan = !isProPlan(currentTeam);

	return (
		<div className="flex flex-col gap-[24px]">
			<div className="flex justify-between items-center">
				<PageHeading as="h1" glow>
					Usage
				</PageHeading>
				<DocsLink href="https://agency.recoder.xyz/docs/settings/team/usage">
					About Usage
				</DocsLink>
			</div>
			<div className="flex flex-col gap-y-[16px] prose-secondary">
				{currentTeamIsFreePlan && (
					<Suspense
						fallback={
							<div className="w-full h-24">
								<Skeleton className="h-full w-full" />
							</div>
						}
					>
						<AgentTimeCharge />
					</Suspense>
				)}

				<AgentUsage />
			</div>
		</div>
	);
}
