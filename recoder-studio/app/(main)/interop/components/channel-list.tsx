"use client";

import {
	HashIcon,
	Loader2Icon,
	MessageSquareIcon,
	RefreshCwIcon,
	UsersIcon,
} from "lucide-react";
import { useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useInteropStore } from "../interop-store";
import type { AMBChannel } from "../types";

/* ------------------------------------------------------------------ */
/*  Single channel row                                                  */
/* ------------------------------------------------------------------ */

function ChannelRow({
	channel,
	isSelected,
	onSelect,
}: {
	channel: AMBChannel;
	isSelected: boolean;
	onSelect: () => void;
}) {
	const ScopeIcon = channel.scope === "dm" ? MessageSquareIcon : HashIcon;

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-left transition-colors",
				isSelected
					? "bg-primary-900/30 border border-primary-800/40 text-primary-200"
					: "border border-transparent hover:bg-neutral-800/40 text-neutral-300 hover:text-neutral-100",
			)}
		>
			<ScopeIcon className="size-4 shrink-0 text-neutral-500" />
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium truncate">{channel.name}</p>
				<p className="text-[10px] text-neutral-500">
					{channel.memberAgentIds.length} agent
					{channel.memberAgentIds.length !== 1 ? "s" : ""}
				</p>
			</div>
		</button>
	);
}

/* ------------------------------------------------------------------ */
/*  ChannelList — shows available AMB channels                          */
/* ------------------------------------------------------------------ */

export function ChannelList({ className }: { className?: string }) {
	const {
		ambChannels,
		ambChannelsLoading,
		ambChannelsError,
		fetchAMBChannels,
		ambSelectedChannelId,
		selectAMBChannel,
		fetchAMBThreads,
	} = useInteropStore();

	useEffect(() => {
		fetchAMBChannels();
	}, [fetchAMBChannels]);

	const handleSelect = useCallback(
		(channelId: string) => {
			selectAMBChannel(channelId);
			fetchAMBThreads(channelId);
		},
		[selectAMBChannel, fetchAMBThreads],
	);

	const handleRefresh = useCallback(() => {
		fetchAMBChannels();
	}, [fetchAMBChannels]);

	return (
		<div
			className={cn(
				"rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-3",
				className,
			)}
		>
			{/* Header */}
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
					<UsersIcon className="size-4 text-primary-800" />
					AMB Channels
					{ambChannels.length > 0 && (
						<span className="text-xs text-neutral-500 font-normal">
							({ambChannels.length})
						</span>
					)}
				</h3>
				<button
					type="button"
					onClick={handleRefresh}
					disabled={ambChannelsLoading}
					className="text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
					title="Refresh channels"
				>
					<RefreshCwIcon
						className={cn(
							"size-3.5",
							ambChannelsLoading && "animate-spin",
						)}
					/>
				</button>
			</div>

			{/* Error */}
			{ambChannelsError && (
				<p className="text-xs text-red-400">{ambChannelsError}</p>
			)}

			{/* Loading */}
			{ambChannelsLoading && ambChannels.length === 0 && (
				<div className="flex items-center gap-1.5 text-xs text-neutral-500 py-2">
					<Loader2Icon className="size-3 animate-spin" />
					Loading channels...
				</div>
			)}

			{/* Empty state */}
			{!ambChannelsLoading && ambChannels.length === 0 && !ambChannelsError && (
				<p className="text-xs text-neutral-500">
					No AMB channels available. Channels are created when agents
					collaborate on tasks.
				</p>
			)}

			{/* Channel list */}
			{ambChannels.length > 0 && (
				<div className="space-y-1 max-h-[200px] overflow-y-auto">
					{ambChannels.map((channel) => (
						<ChannelRow
							key={channel.id}
							channel={channel}
							isSelected={ambSelectedChannelId === channel.id}
							onSelect={() => handleSelect(channel.id)}
						/>
					))}
				</div>
			)}
		</div>
	);
}
