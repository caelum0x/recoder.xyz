import { SearchInput } from "@recoder-internal/ui/search-input";
import { desc, eq } from "drizzle-orm";
import { db, workspaces } from "@/db";
import { fetchCurrentTeam, fetchUserTeams } from "@/services/teams";
import { fetchCurrentUser } from "@/services/accounts";
import { fetchFlowTriggers } from "../stage/(depreacted)/services";
import { getAccountInfo } from "../settings/account/actions";
import { TextBanner } from "./components/text-banner";
import { LobbyClient } from "./lobby-client";

export default async function LobbyPage() {
	const accountInfo = await getAccountInfo();
	const username = accountInfo.displayName || accountInfo.email || "there";

	// Fetch real data for the lobby
	const currentTeam = await fetchCurrentTeam();
	const teams = await fetchUserTeams();
	const user = await fetchCurrentUser();

	// Fetch recent workspaces (workflows) for current team
	const recentWorkspacesData = await db
		.select({
			id: workspaces.id,
			name: workspaces.name,
			updatedAt: workspaces.updatedAt,
		})
		.from(workspaces)
		.where(eq(workspaces.teamDbId, currentTeam.dbId))
		.orderBy(desc(workspaces.updatedAt))
		.limit(10);

	const recentWorkflows = recentWorkspacesData.map((ws) => ({
		id: ws.id,
		name: ws.name ?? "Untitled",
		updatedAt: ws.updatedAt,
	}));

	// Fetch executable apps (flow triggers) for current team
	let recentApps: { title: string; appsCount: number }[] = [];
	try {
		const executableFlowTriggers = await fetchFlowTriggers(teams, "all", user);
		const teamFlowTriggers = executableFlowTriggers.filter(
			(trigger) => trigger.teamId === currentTeam.id,
		);

		// Group by workspace name and count
		const appsByName = new Map<string, number>();
		for (const trigger of teamFlowTriggers) {
			const name = trigger.workspaceName;
			appsByName.set(name, (appsByName.get(name) || 0) + 1);
		}

		recentApps = Array.from(appsByName.entries()).map(([title, appsCount]) => ({
			title,
			appsCount,
		}));
	} catch {
		// If flow trigger fetching fails, show empty state
		recentApps = [];
	}

	return (
		<div className="px-6 py-3 md:px-10 md:py-5 text-text">
			{/* Header */}
			<div className="mb-8 flex flex-col sm:flex-row sm:justify-between gap-3 items-center">
				{/* Text Banner */}
				<TextBanner
					title="Introducing Library"
					description="Bring your docs, code, and files to collaborate with Recoder Agency and your team."
					moreLinkText="More"
				/>
				<div className="flex items-center gap-3 w-full sm:w-auto">
					<div className="w-full sm:w-auto sm:max-w-lg">
						<SearchInput
							placeholder="App search"
							className="text-inverse text-sm"
						/>
					</div>
				</div>
			</div>

			<LobbyClient
				username={username}
				recentApps={recentApps}
				recentWorkflows={recentWorkflows}
			/>
		</div>
	);
}
