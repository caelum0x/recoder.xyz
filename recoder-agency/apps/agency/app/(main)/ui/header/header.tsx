import Link from "next/link";
import { Suspense } from "react";
import { RecoderLogo } from "@/components/recoder-logo";
import { AccountMenu, getCurrentUser } from "./account-menu";
import { MobileMenu } from "./mobile-menu";
import { getTeamContext, TeamSwitcher } from "./team-switcher";

export function Header() {
	return (
		<header className="h-16 shrink-0 border-b border-border flex items-center justify-between px-4 md:px-6 bg-background">
			{/* Left side: Logo + Team Selection */}
			<div className="flex items-center gap-2">
				<Link href="/" aria-label="Go to home" className="group">
					<RecoderLogo size={24} />
				</Link>

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
				<a
					href="https://docs.recoder.xyz"
					className="text-link-muted hover:text-accent text-sm transition-colors"
				>
					Docs
				</a>
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
						<div className="w-8 h-8 bg-inverse/20 animate-pulse rounded-full" />
					}
				>
					<AccountMenu currentUserPromise={getCurrentUser()} />
				</Suspense>
			</MobileMenu>
		</header>
	);
}
