"use client";

import {
	FileTextIcon,
	FolderKanbanIcon,
	LayoutDashboardIcon,
	ReceiptTextIcon,
	UserIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
	{
		label: "Dashboard",
		href: "/portal",
		icon: LayoutDashboardIcon,
	},
	{
		label: "My Projects",
		href: "/portal/projects",
		icon: FolderKanbanIcon,
	},
	{
		label: "Quotes",
		href: "/portal/quotes",
		icon: ReceiptTextIcon,
	},
	{
		label: "Submit Brief",
		href: "/portal/briefs/new",
		icon: FileTextIcon,
	},
	{
		label: "Account",
		href: "/portal/account",
		icon: UserIcon,
	},
];

export function ClientSidebar() {
	const pathname = usePathname();

	return (
		<nav className="w-[220px] border-r border-border bg-background p-4 flex flex-col gap-1">
			{links.map((link) => {
				const isActive = pathname.startsWith(link.href);
				const Icon = link.icon;
				return (
					<Link
						key={link.href}
						href={link.href}
						className={cn(
							"flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
							isActive
								? "bg-primary/10 text-primary font-medium"
								: "text-text-muted hover:text-text hover:bg-bg-hover",
						)}
					>
						<Icon className="size-4" />
						{link.label}
					</Link>
				);
			})}
		</nav>
	);
}
