import { SearchInput } from "@recoder-internal/ui/search-input";
import { fetchCurrentTeam } from "@/services/teams";
import { getAccountInfo } from "../settings/account/actions";
import {
	getFeaturedApps,
	getFeaturedItemIds,
	getFeaturedWorkflows,
	getRecentApps,
	getRecentWorkflows,
} from "./actions";
import { TextBanner } from "./components/text-banner";
import { LobbyClient } from "./lobby-client";

export default async function LobbyPage() {
	const accountInfo = await getAccountInfo();
	const username = accountInfo.displayName || accountInfo.email || "there";

	const currentTeam = await fetchCurrentTeam();
	const isAdmin = currentTeam.role === "admin";

	// Fetch recent and featured apps/workflows from DB
	const [
		recentAppsData,
		recentWorkflowsData,
		featuredAppsData,
		featuredWorkflowsData,
		featuredIdMap,
	] = await Promise.all([
		getRecentApps(currentTeam.dbId),
		getRecentWorkflows(currentTeam.dbId),
		getFeaturedApps(currentTeam.dbId),
		getFeaturedWorkflows(currentTeam.dbId),
		isAdmin ? getFeaturedItemIds(currentTeam.dbId) : Promise.resolve(new Map()),
	]);

	const recentApps = recentAppsData.map((app) => ({
		title: app.id,
		appsCount: 1,
	}));

	const recentWorkflows = recentWorkflowsData.map((ws) => ({
		id: ws.id,
		name: ws.name ?? "Untitled",
		updatedAt: ws.updatedAt,
	}));

	const featuredApps = featuredAppsData.map((app) => ({
		title: app.id,
		appsCount: 1,
	}));

	const featuredWorkflows = featuredWorkflowsData.map((ws) => ({
		id: ws.id,
		name: ws.name ?? "Untitled",
		updatedAt: ws.updatedAt,
	}));

	// Convert Map to a plain object for serialization
	const featuredIds: Record<string, boolean> = {};
	for (const [key, val] of featuredIdMap) {
		featuredIds[key] = val;
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
				featuredApps={featuredApps}
				featuredWorkflows={featuredWorkflows}
				isAdmin={isAdmin}
				teamDbId={currentTeam.dbId}
				featuredIds={featuredIds}
			/>
		</div>
	);
}
