import { DocsLink } from "@giselle-internal/ui/docs-link";
import { PageHeading } from "@giselle-internal/ui/page-heading";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCurrentTeam, isProPlan } from "@/services/teams";
import { AgentTimeCharge } from "../agent-time-charge";
import { AgentUsage } from "../agent-usage";
import { UseCaseDashboardLive } from "../use-case-dashboard-live";
import { UseCaseReadinessPanel } from "../use-case-readiness-panel";

export default async function TeamUsagePage() {
	const currentTeam = await fetchCurrentTeam();
	const currentTeamIsFreePlan = !isProPlan(currentTeam);

	return (
		<div className="flex flex-col gap-[24px]">
			<div className="flex justify-between items-center">
				<PageHeading as="h1" glow>
					Usage
				</PageHeading>
				<DocsLink href="https://docs.recoder.xyz/en/guides/settings/team/usage">
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
				<Suspense
					fallback={
						<div className="w-full h-56">
							<Skeleton className="h-full w-full" />
						</div>
					}
				>
					<UseCaseReadinessPanel />
				</Suspense>
				<Suspense
					fallback={
						<div className="w-full h-44">
							<Skeleton className="h-full w-full" />
						</div>
					}
				>
					<UseCaseDashboardLive />
				</Suspense>
			</div>
		</div>
	);
}
