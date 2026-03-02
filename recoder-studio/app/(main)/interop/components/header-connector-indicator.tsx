"use client";

import { NetworkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInteropStore } from "../interop-store";
import { useInteropEnabled } from "../use-interop-enabled";
import { ConnectorStatusCompact } from "./connector-status";

/**
 * Small header indicator that shows connector health and opens the interop panel.
 * Renders nothing when the interop feature flag is off.
 */
export function HeaderConnectorIndicator({
	className,
}: { className?: string }) {
	const { enabled } = useInteropEnabled();
	const { togglePanel, panelOpen } = useInteropStore();

	if (!enabled) return null;

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<ConnectorStatusCompact />
			<button
				type="button"
				onClick={togglePanel}
				className={cn(
					"p-1 rounded-md transition-colors",
					panelOpen
						? "text-primary-800 bg-primary-800/10"
						: "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50",
				)}
				title="Toggle Interop Panel"
			>
				<NetworkIcon className="size-3.5" />
			</button>
		</div>
	);
}
