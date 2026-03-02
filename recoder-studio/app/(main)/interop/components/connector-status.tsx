"use client";

import {
	Loader2Icon,
	RefreshCwIcon,
	WifiIcon,
	WifiOffIcon,
} from "lucide-react";
import { useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useInteropStore } from "../interop-store";
import type { ConnectorHealth } from "../types";

/* ------------------------------------------------------------------ */
/*  Health indicator dot                                                */
/* ------------------------------------------------------------------ */

const healthColors: Record<ConnectorHealth, string> = {
	online: "bg-green-500",
	offline: "bg-neutral-600",
	degraded: "bg-yellow-500",
	error: "bg-red-500",
	unknown: "bg-neutral-500",
};

const healthLabels: Record<ConnectorHealth, string> = {
	online: "Online",
	offline: "Offline",
	degraded: "Degraded",
	error: "Error",
	unknown: "Unknown",
};

function HealthDot({ health }: { health: ConnectorHealth }) {
	return (
		<span className="relative flex size-2.5">
			{health === "online" && (
				<span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
			)}
			<span
				className={cn(
					"relative inline-flex size-2.5 rounded-full",
					healthColors[health],
				)}
			/>
		</span>
	);
}

/* ------------------------------------------------------------------ */
/*  Compact variant — toolbar indicator                                */
/* ------------------------------------------------------------------ */

export function ConnectorStatusCompact({
	className,
}: { className?: string }) {
	const { connectors, connectorsLoading, fetchConnectors } =
		useInteropStore();

	useEffect(() => {
		fetchConnectors();
	}, [fetchConnectors]);

	const onlineCount = connectors.filter((c) => c.health === "online").length;
	const totalCount = connectors.length;

	if (connectorsLoading && totalCount === 0) {
		return (
			<div
				className={cn(
					"flex items-center gap-1.5 text-xs text-neutral-500",
					className,
				)}
			>
				<Loader2Icon className="size-3 animate-spin" />
				<span>Connectors</span>
			</div>
		);
	}

	const allOnline = totalCount > 0 && onlineCount === totalCount;
	const someOnline = onlineCount > 0 && onlineCount < totalCount;

	return (
		<button
			type="button"
			onClick={() => fetchConnectors()}
			className={cn(
				"flex items-center gap-1.5 text-xs transition-colors",
				allOnline
					? "text-green-400"
					: someOnline
						? "text-yellow-400"
						: "text-neutral-500",
				"hover:text-neutral-300",
				className,
			)}
			title={`${onlineCount}/${totalCount} connectors online`}
		>
			{allOnline ? (
				<WifiIcon className="size-3.5" />
			) : (
				<WifiOffIcon className="size-3.5" />
			)}
			<span>
				{totalCount > 0
					? `${onlineCount}/${totalCount}`
					: "No connectors"}
			</span>
		</button>
	);
}

/* ------------------------------------------------------------------ */
/*  Full variant — panel card                                          */
/* ------------------------------------------------------------------ */

export function ConnectorStatus({ className }: { className?: string }) {
	const {
		connectors,
		connectorsLoading,
		connectorsError,
		fetchConnectors,
	} = useInteropStore();

	const refresh = useCallback(() => {
		fetchConnectors();
	}, [fetchConnectors]);

	useEffect(() => {
		fetchConnectors();
	}, [fetchConnectors]);

	return (
		<div
			className={cn(
				"rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-3",
				className,
			)}
		>
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
					<WifiIcon className="size-4 text-primary-800" />
					Connectors
				</h3>
				<button
					type="button"
					onClick={refresh}
					disabled={connectorsLoading}
					className="text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
					title="Refresh"
				>
					<RefreshCwIcon
						className={cn(
							"size-3.5",
							connectorsLoading && "animate-spin",
						)}
					/>
				</button>
			</div>

			{connectorsError && (
				<p className="text-xs text-red-400">{connectorsError}</p>
			)}

			{connectors.length === 0 && !connectorsLoading && (
				<p className="text-xs text-neutral-500">
					No connectors registered. Start a bridge session to see status here.
				</p>
			)}

			<ul className="space-y-2">
				{connectors.map((connector) => (
					<li
						key={connector.id}
						className="flex items-center gap-3 rounded-md border border-neutral-800/50 bg-neutral-900/50 px-3 py-2"
					>
						<HealthDot health={connector.health} />
						<div className="flex-1 min-w-0">
							<p className="text-sm text-neutral-200 truncate">
								{connector.name}
							</p>
							<p className="text-xs text-neutral-500">
								{connector.platform}
								{connector.version ? ` v${connector.version}` : ""}
							</p>
						</div>
						<div className="text-right">
							<span
								className={cn(
									"text-xs font-medium",
									connector.health === "online"
										? "text-green-400"
										: connector.health === "error"
											? "text-red-400"
											: connector.health === "degraded"
												? "text-yellow-400"
												: "text-neutral-500",
								)}
							>
								{healthLabels[connector.health]}
							</span>
							{connector.latencyMs != null && (
								<p className="text-[10px] text-neutral-600">
									{connector.latencyMs}ms
								</p>
							)}
						</div>
					</li>
				))}
			</ul>

			{connectorsLoading && connectors.length > 0 && (
				<div className="flex items-center gap-1.5 text-xs text-neutral-500">
					<Loader2Icon className="size-3 animate-spin" />
					Refreshing...
				</div>
			)}
		</div>
	);
}
