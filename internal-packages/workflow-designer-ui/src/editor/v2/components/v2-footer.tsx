"use client";

import {
	ExternalLinkIcon,
	FileKey2Icon,
	HistoryIcon,
	MessageCircleIcon,
} from "lucide-react";
import { Tooltip } from "../../../ui/tooltip";
import type { LeftPanelValue } from "../state";

interface V2FooterProps {
	onLeftPanelValueChange: (leftMenu: LeftPanelValue) => void;
	activePanel?: LeftPanelValue | null;
	chat?: {
		onToggle: () => void;
		isOpen: boolean;
	};
}

export function V2Footer({
	onLeftPanelValueChange,
	activePanel,
	chat,
}: V2FooterProps) {
	return (
		<footer className="h-[30px] bg-bg border-t border-border/10 px-4 flex items-center">
			<div className="flex items-center justify-between w-full">
				<div className="flex items-center space-x-3">
					<Tooltip
						text="Run History"
						variant="dark"
						className="border border-white-400/20"
						sideOffset={-4}
						side="top"
						align="start"
					>
						<button
							type="button"
							onClick={() => onLeftPanelValueChange("run-history")}
							data-panel-trigger="run-history"
							className={`cursor-pointer ${
								activePanel === "run-history"
									? "text-[#6B8FF0]"
									: "text-inverse hover:text-icon-hover"
							}`}
						>
							<HistoryIcon className="w-[14px] h-[14px]" />
						</button>
					</Tooltip>
					<Tooltip
						text="Secrets"
						variant="dark"
						className="border border-white-400/20"
						sideOffset={-4}
						side="top"
						align="start"
					>
						<button
							type="button"
							onClick={() => onLeftPanelValueChange("secret")}
							data-panel-trigger="secret"
							className={`cursor-pointer ${
								activePanel === "secret"
									? "text-[#6B8FF0]"
									: "text-inverse hover:text-icon-hover"
							}`}
						>
							<FileKey2Icon className="w-[14px] h-[14px]" />
						</button>
					</Tooltip>
				</div>
				<div className="flex items-center space-x-3">
					<Tooltip
						text="Chat"
						variant="dark"
						className="border border-white-400/20"
						sideOffset={-4}
						side="top"
						align="start"
					>
						<button
							type="button"
							onClick={chat?.onToggle}
							data-panel-trigger="chat"
							className={`cursor-pointer ${
								chat?.isOpen
									? "text-[#6B8FF0]"
									: "text-inverse hover:text-icon-hover"
							}`}
						>
							<MessageCircleIcon className="w-[14px] h-[14px]" />
						</button>
					</Tooltip>
					<Tooltip
						text="Documentation"
						variant="dark"
						className="border border-white-400/20"
						sideOffset={-4}
						side="top"
						align="start"
					>
						<a
							href="https://docs.giselles.ai/en/guides/introduction"
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-inverse hover:text-icon-hover flex items-center gap-1"
						>
							Docs
							<ExternalLinkIcon className="w-[10px] h-[10px]" />
						</a>
					</Tooltip>
				</div>
			</div>
		</footer>
	);
}
