import Link from "next/link";
import { Suspense } from "react";
import { RecoderLogo } from "@/components/recoder-logo";
import { AccountMenu, getCurrentUser } from "./account-menu";
import { AppSwitcher } from "./app-switcher";
import { MobileMenu } from "./mobile-menu";
import { getTeamContext, TeamSwitcher } from "./team-switcher";
import { getUpgradeButtonContext, UpgradeButton } from "./upgrade-button";

export function Header() {
	return (
		<header className="h-16 shrink-0 border-b border-border flex items-center justify-between px-4 md:px-6 bg-background">
			{/* Left side: Logo + App Switcher + Team Selection */}
			<div className="flex items-center gap-[3px]">
				<Link href="/" aria-label="Go to home" className="group">
					<RecoderLogo size={24} />
				</Link>
				<span className="hidden md:inline-flex">
					<AppSwitcher />
				</span>
				<span className="hidden md:inline text-inverse/20 text-[18px] font-[250] leading-none ml-[4px]">
					/
				</span>

				<span className="hidden md:inline-flex">
					<Suspense
						fallback={
							<div className="w-24 h-6 bg-inverse/20 animate-pulse rounded-md" />
						}
					>
						<TeamSwitcher getTeamContext={getTeamContext()} />
					</Suspense>
				</span>
			</div>

			{/* Right side: Desktop nav (hidden on mobile) */}
			<div className="hidden md:flex items-center gap-4">
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

			{/* Mobile menu toggle + drawer (visible only on mobile) */}
			<MobileMenu>
				<Suspense
					fallback={
						<div className="w-16 h-6 bg-inverse/20 animate-pulse rounded-md" />
					}
				>
					<UpgradeButton
						getUpgradeButtonContextPromise={getUpgradeButtonContext()}
					/>
				</Suspense>
				<Suspense
					fallback={
						<div className="w-8 h-8 bg-inverse/20 animate-pulse rounded-full" />
					}
				>
					<AccountMenu currentUserPromise={getCurrentUser()} />
				</Suspense>
			</MobileMenu>
		</header>
	);
}
