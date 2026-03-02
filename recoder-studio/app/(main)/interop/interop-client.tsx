"use client";

import { NetworkIcon, ToggleLeftIcon, ToggleRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActiveTasksList } from "./components/active-tasks-list";
import { ApprovalTimeline } from "./components/approval-timeline";
import { ConnectorStatus } from "./components/connector-status";
import { DelegateAction } from "./components/delegate-action";
import { AMBPanel } from "./amb/amb-panel";
import { useInteropEnabled } from "./use-interop-enabled";

export function InteropClient() {
	const { enabled, toggle, canToggleInternal, stage, ready } = useInteropEnabled();
	const toggleLabel = canToggleInternal
		? `Interop ${enabled ? "ON" : "OFF"}`
		: ready
			? `Rollout: ${stage.toUpperCase()}`
			: "Resolving rollout...";

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6">
			{/* Page header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-neutral-100 flex items-center gap-3">
						<NetworkIcon className="size-6 text-primary-800" />
						Interop MVP
					</h1>
					<p className="text-sm text-neutral-400 mt-1">
						Delegate tasks to external agents, monitor connector health, and
						manage approval workflows.
					</p>
				</div>

				{/* Feature flag toggle */}
				<button
					type="button"
					onClick={toggle}
					disabled={!canToggleInternal}
					className={cn(
						"flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
						enabled
							? "border-green-700/40 bg-green-900/20 text-green-400"
							: "border-neutral-700 bg-neutral-900 text-neutral-500",
						!canToggleInternal && "cursor-not-allowed opacity-70",
					)}
				>
					{enabled ? (
						<ToggleRightIcon className="size-4" />
					) : (
						<ToggleLeftIcon className="size-4" />
					)}
					{toggleLabel}
				</button>
			</div>

			{/* Two-column layout */}
			<div className="grid gap-6 lg:grid-cols-2">
				{/* Left column */}
				<div className="space-y-4">
					<DelegateAction />
					<ActiveTasksList />
				</div>

				{/* Right column */}
				<div className="space-y-4">
					<ConnectorStatus />
					<ApprovalTimeline />
				</div>
			</div>

			<div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden h-[560px]">
				<AMBPanel />
			</div>
		</div>
	);
}
