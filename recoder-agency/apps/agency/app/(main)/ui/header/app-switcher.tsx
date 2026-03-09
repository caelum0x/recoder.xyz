"use client";

import { PopoverContent } from "@recoder-internal/ui/popover";
import { ArrowUpRight } from "lucide-react";
import { Popover } from "radix-ui";
import { NotificationBell } from "./notification-bell";
import { SubscriptionBadge } from "./subscription-badge";

const currentAppId = "agency";

const switcherApps = [
	{
		id: "web",
		label: "Web",
		description: "AI Workspace",
		href: "https://web.recoder.xyz",
	},
	{
		id: "agency",
		label: "Agency",
		description: "AI Agency Platform",
		href: "https://agency.recoder.xyz",
	},
	{
		id: "pm",
		label: "PM",
		description: "Product Management",
		href: "https://pm.recoder.xyz",
	},
	{
		id: "agents",
		label: "Agents",
		description: "AI Agent IDE",
		href: "https://agents.recoder.xyz",
	},
	{
		id: "openclaw",
		label: "OpenClaw",
		description: "Open-source AI Tools",
		href: "https://openclaw.recoder.xyz",
	},
] as const;

export function AppSwitcher() {
	return (
		<div className="flex items-center gap-2">
			<SubscriptionBadge />
			<NotificationBell />
		<Popover.Root>
			<Popover.Trigger className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-inverse/50 hover:text-inverse/80 hover:bg-white/5 transition-colors outline-none focus:ring-0">
				<span>Apps</span>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content sideOffset={4} align="start">
					<PopoverContent>
						{switcherApps.map((app) => {
							const isCurrent = app.id === currentAppId;
							return (
								<a
									key={app.id}
									href={app.href}
									rel="noopener noreferrer"
									className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
										isCurrent
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
									{!isCurrent && (
										<ArrowUpRight className="h-3 w-3 shrink-0 opacity-40" />
									)}
								</a>
							);
						})}
					</PopoverContent>
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
		</div>
	);
}
