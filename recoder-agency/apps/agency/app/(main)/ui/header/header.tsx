import Link from "next/link";
import { Suspense } from "react";
import { RecoderLogo } from "@/components/recoder-logo";
import { AccountMenu, getCurrentUser } from "./account-menu";
import { getTeamContext, TeamSwitcher } from "./team-switcher";
import { getUpgradeButtonContext, UpgradeButton } from "./upgrade-button";

export function Header() {
	return (
		<header className="h-[48px] shrink-0 border-b border-border flex items-center justify-between px-4 bg-background">
			{/* Left side: Logo + Team Selection */}
			<div className="flex items-center gap-[3px]">
				<Link href="/" aria-label="Go to home" className="group">
					<RecoderLogo size={24} />
				</Link>
				<span className="text-inverse/20 text-[18px] font-[250] leading-none ml-[4px]">
					/
				</span>

				<Suspense
					fallback={
						<div className="w-24 h-6 bg-inverse/20 animate-pulse rounded-md" />
					}
				>
					<TeamSwitcher getTeamContext={getTeamContext()} />
				</Suspense>
			</div>

			{/* Right side: Upgrade + Docs + User Menu */}
			<div className="flex items-center gap-4">
				<Suspense
					fallback={
						<div className="w-16 h-6 bg-inverse/20 animate-pulse rounded-md" />
					}
				>
					<UpgradeButton
						getUpgradeButtonContextPromise={getUpgradeButtonContext()}
					/>
				</Suspense>
				<Link
					href="/docs"
					className="text-link-muted hover:text-accent text-sm transition-colors"
				>
					Docs
				</Link>
				<div className="flex items-center">
					<Suspense
						fallback={
							<div className="w-8 h-8 bg-inverse/20 animate-pulse rounded-full" />
						}
					>
						<AccountMenu currentUserPromise={getCurrentUser()} />
					</Suspense>
				</div>
			</div>
		</header>
	);
}
