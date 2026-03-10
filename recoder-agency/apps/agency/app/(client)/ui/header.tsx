import Link from "next/link";
import { RecoderLogo } from "@/components/recoder-logo";

export function ClientHeader() {
	return (
		<header className="h-16 shrink-0 border-b border-border flex items-center justify-between px-6 bg-background">
			<div className="flex items-center gap-3">
				<Link href="/portal" aria-label="Go to dashboard">
					<RecoderLogo size={24} />
				</Link>
				<span className="text-text-muted text-sm font-medium">
					Client Portal
				</span>
			</div>
			<div className="flex items-center gap-4">
				<Link
					href="/portal/account"
					className="text-sm text-text-muted hover:text-text transition-colors"
				>
					Account
				</Link>
			</div>
		</header>
	);
}
