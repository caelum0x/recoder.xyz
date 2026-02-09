import Link from "next/link";
import { Suspense } from "react";
import { RecoderLogo } from "@/components/recoder-logo";
import {
	AccountMenu,
	getCurrentUser,
} from "../../(main)/ui/header/account-menu";

export function AdminHeader() {
	return (
		<header className="h-[48px] shrink-0 border-b border-border flex items-center justify-between px-4 bg-background">
			<div className="flex items-center gap-3">
				<Link href="/dashboard" aria-label="Go to dashboard" className="group">
					<RecoderLogo size={24} />
				</Link>
				<span className="text-text-muted text-sm font-medium">Agency</span>
			</div>

			<div className="flex items-center gap-4">
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
