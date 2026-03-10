"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type FilterType = "status_change" | "deliverable" | "approval" | "comment";

const filters: { label: string; value: FilterType | null }[] = [
	{ label: "All", value: null },
	{ label: "Status Changes", value: "status_change" },
	{ label: "Deliverables", value: "deliverable" },
	{ label: "Approvals", value: "approval" },
];

interface TimelineFilterProps {
	activeFilter: string | null;
}

export function TimelineFilter({ activeFilter }: TimelineFilterProps) {
	const pathname = usePathname();

	return (
		<div className="flex flex-wrap gap-2">
			{filters.map((f) => {
				const isActive =
					(f.value === null && !activeFilter) || f.value === activeFilter;
				const href =
					f.value === null ? pathname : `${pathname}?filter=${f.value}`;

				return (
					<Link
						key={f.label}
						href={href}
						className={cn(
							"inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
							isActive
								? "bg-primary text-white"
								: "bg-background border border-border text-text-muted hover:text-text hover:bg-bg-hover",
						)}
					>
						{f.label}
					</Link>
				);
			})}
		</div>
	);
}
