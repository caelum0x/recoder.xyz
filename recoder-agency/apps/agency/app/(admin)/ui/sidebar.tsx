"use client";

import {
	BanknoteIcon,
	FileTextIcon,
	FolderKanbanIcon,
	LayoutDashboardIcon,
	LayoutTemplateIcon,
	PackageIcon,
	ShieldAlertIcon,
	TrendingUpIcon,
	UsersIcon,
	WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
	{
		label: "Dashboard",
		href: "/dashboard",
		icon: LayoutDashboardIcon,
	},
	{
		label: "Clients",
		href: "/clients",
		icon: UsersIcon,
	},
	{
		label: "Projects",
		href: "/projects",
		icon: FolderKanbanIcon,
	},
	{
		label: "Services",
		href: "/services",
		icon: PackageIcon,
	},
	{
		label: "Quotes",
		href: "/quotes",
		icon: FileTextIcon,
	},
	{
		label: "Budget",
		href: "/budget",
		icon: WalletIcon,
	},
	{
		label: "Margin",
		href: "/margin",
		icon: TrendingUpIcon,
	},
	{
		label: "Revenue",
		href: "/revenue",
		icon: BanknoteIcon,
	},
	{
		label: "Templates",
		href: "/templates",
		icon: LayoutTemplateIcon,
	},
	{
		label: "Delivery Ops",
		href: "/delivery-ops",
		icon: ShieldAlertIcon,
	},
];

export function AdminSidebar() {
	const pathname = usePathname();

	return (
		<nav className="w-[240px] border-r border-border bg-background p-4 flex flex-col gap-1">
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
