"use client";

import { PopoverContent } from "@recoder-internal/ui/popover";
import { ArrowUpRight } from "lucide-react";
import { Popover } from "radix-ui";

const apps = [
	{
		label: "Hub",
		description: "Dashboard & Settings",
		href: "https://recoder.xyz",
		current: false,
	},
	{
		label: "Frontend",
		description: "AI Agent IDE",
		href: "https://frontend.recoder.xyz",
		current: false,
	},
	{
		label: "Web",
		description: "Web AI IDE",
		href: "https://web.recoder.xyz",
		current: false,
	},
	{
		label: "PM",
		description: "Project Management",
		href: "https://pm.recoder.xyz",
		current: false,
	},
	{
		label: "Studio",
		description: "Visual Workflow Designer",
		href: "https://studio.recoder.xyz",
		current: false,
	},
	{
		label: "Agency",
		description: "AI Agent Workflows",
		href: "https://agency.recoder.xyz",
		current: true,
	},
	{
		label: "OpenClaw",
		description: "Open-Source AI Tools",
		href: "https://openclaw.recoder.xyz",
		current: false,
	},
] as const;

export function AppSwitcher() {
	return (
		<Popover.Root>
			<Popover.Trigger className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-inverse/50 hover:text-inverse/80 hover:bg-white/5 transition-colors outline-none focus:ring-0">
				<span>Apps</span>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content sideOffset={4} align="start">
					<PopoverContent>
						{apps.map((app) => (
							<a
								key={app.label}
								href={app.href}
								className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
									app.current
										? "text-inverse bg-white/10"
										: "text-inverse/60 hover:text-inverse hover:bg-white/5"
								}`}
							>
								<div className="flex flex-col">
									<span className="font-medium">{app.label}</span>
									<span className="text-[11px] text-inverse/40">
										{app.description}
									</span>
								</div>
								{!app.current && (
									<ArrowUpRight className="h-3 w-3 shrink-0 opacity-40" />
								)}
							</a>
						))}
					</PopoverContent>
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}
