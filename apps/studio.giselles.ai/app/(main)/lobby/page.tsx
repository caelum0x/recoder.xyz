import { SearchInput } from "@giselle-internal/ui/search-input";
import { getAccountInfo } from "../settings/account/actions";
import { TextBanner } from "./components/text-banner";
import { LobbyClient } from "./lobby-client";

export default async function LobbyPage() {
	const accountInfo = await getAccountInfo();
	const username = accountInfo.displayName || accountInfo.email || "there";

	return (
		<div className="px-6 py-3 md:px-10 md:py-5 text-text">
			{/* Header */}
			<div className="mb-8 flex flex-col sm:flex-row sm:justify-between gap-3 items-center">
				{/* Text Banner */}
				<TextBanner
					title="Recoder Studio Core"
					description="Build and operate production AI workflows: Design, Simulate, Deploy, Observe, Iterate."
					moreLinkText="Explore"
				/>
				<div className="flex items-center gap-3 w-full sm:w-auto">
					<div className="w-full sm:w-auto sm:max-w-lg">
						<SearchInput
							placeholder="Search workflows, templates, and runtime assets"
							className="text-inverse text-sm"
						/>
					</div>
				</div>
			</div>

			<LobbyClient username={username} />
		</div>
	);
}
