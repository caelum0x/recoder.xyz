import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { VectorStoresSidebarMenu } from "./sidebar-menu";

type VectorStoresNavigationLayoutProps = {
	children: ReactNode;
};

export function VectorStoresNavigationLayout({
	children,
}: VectorStoresNavigationLayoutProps) {
	return (
		<div className="flex flex-col min-h-full">
			<div className="mb-2">
				<Link
					href="/settings/team"
					className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeftIcon className="w-4 h-4" />
					Back to Settings
				</Link>
			</div>
			<VectorStoresSidebarMenu />
			<div className="flex-1">{children}</div>
		</div>
	);
}
