"use client";

import {
	ChevronLeftIcon,
	ChevronRightIcon,
	NetworkIcon,
	SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInteropStore } from "../interop-store";
import { useInteropEnabled } from "../use-interop-enabled";
import { ActiveTasksList } from "./active-tasks-list";
import { ApprovalTimeline } from "./approval-timeline";
import { ChannelList } from "./channel-list";
import { ConnectorStatus } from "./connector-status";
import { DelegateAction } from "./delegate-action";
import { ThreadView } from "./thread-view";

/* ------------------------------------------------------------------ */
/*  InteropPanel — collapsible sidebar panel                           */
/* ------------------------------------------------------------------ */

export function InteropPanel({ className }: { className?: string }) {
	const { enabled } = useInteropEnabled();
	const { panelOpen, togglePanel } = useInteropStore();

	if (!enabled) return null;

	return (
		<>
			{/* Collapsed toggle tab */}
			{!panelOpen && (
				<button
					type="button"
					onClick={togglePanel}
					className={cn(
						"fixed right-0 top-1/2 -translate-y-1/2 z-40",
						"flex items-center gap-1 rounded-l-lg border border-r-0 border-neutral-800 bg-neutral-950 px-1.5 py-3 text-neutral-400 transition-colors hover:text-primary-200 hover:border-primary-800",
						className,
					)}
					title="Open Interop Panel"
				>
					<ChevronLeftIcon className="size-4" />
					<NetworkIcon className="size-4" />
				</button>
			)}

			{/* Panel */}
			<div
				className={cn(
					"fixed right-0 top-[48px] bottom-0 z-30 flex flex-col border-l border-neutral-800 bg-neutral-950/95 backdrop-blur-sm transition-all duration-300 ease-in-out",
					panelOpen
						? "w-[380px] translate-x-0"
						: "w-[380px] translate-x-full",
				)}
			>
				{/* Panel header */}
				<div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 shrink-0">
					<h2 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
						<NetworkIcon className="size-4 text-primary-800" />
						Interop
					</h2>
					<div className="flex items-center gap-2">
						<InteropDevToggle />
						<button
							type="button"
							onClick={togglePanel}
							className="text-neutral-500 hover:text-neutral-300 p-1 rounded-md hover:bg-neutral-800/50"
							title="Close panel"
						>
							<ChevronRightIcon className="size-4" />
						</button>
					</div>
				</div>

				{/* Panel body — scrollable */}
				<div className="flex-1 overflow-y-auto p-4 space-y-4">
					<DelegateAction />
					<ActiveTasksList />
					<ConnectorStatus />
					<ApprovalTimeline />
				</div>
			</div>
		</>
	);
}

/* ------------------------------------------------------------------ */
/*  Dev toggle — small gear icon that shows interop toggle             */
/* ------------------------------------------------------------------ */

function InteropDevToggle() {
	const { enabled, toggle, canToggleInternal, stage } = useInteropEnabled();

	return (
		<button
			type="button"
			onClick={toggle}
			disabled={!canToggleInternal}
			className={cn(
				"p-1 rounded-md text-xs transition-colors",
				enabled
					? "text-green-400 hover:bg-green-900/20"
					: "text-neutral-600 hover:bg-neutral-800/50",
				!canToggleInternal && "cursor-not-allowed opacity-60",
			)}
			title={
				canToggleInternal
					? `Interop: ${enabled ? "ON" : "OFF"} (click to toggle)`
					: `Interop managed by ${stage.toUpperCase()} rollout`
			}
		>
			<SettingsIcon className="size-3.5" />
		</button>
	);
}
