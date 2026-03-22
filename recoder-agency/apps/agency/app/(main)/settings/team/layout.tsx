import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

export default function SettingsTeamLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="h-full bg-bg">
			<div className="px-[40px] py-[24px] flex-1 max-w-[1200px] mx-auto w-full">
				<Link
					href="/workspaces"
					className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
				>
					<ArrowLeftIcon className="w-4 h-4" />
					Back to Agency
				</Link>
				{children}
			</div>
		</div>
	);
}
