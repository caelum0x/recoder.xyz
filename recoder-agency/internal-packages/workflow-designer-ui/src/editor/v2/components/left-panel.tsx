"use client";

import clsx from "clsx/lite";
import { X } from "lucide-react";

export function LeftPanel({
	title,
	children,
	onClose,
	className,
}: React.PropsWithChildren<{
	title: string;
	onClose: () => void;
	className?: string;
}>) {
	return (
		<div className={clsx("h-full flex flex-col", className)}>
			{/* Header */}
			<div className="flex items-center justify-between pl-4 py-3 bg-bg flex-shrink-0">
				<h2 className="font-sans text-text text-[20px] font-thin">{title}</h2>
				{onClose && (
					<button
						type="button"
						onClick={onClose}
						className="p-1 rounded hover:bg-bg-700 text-text hover:text-inverse transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				)}
			</div>

			{/* Content */}
			<div className="flex-1 overflow-hidden">
				<div className="h-full">{children}</div>
			</div>
		</div>
	);
}
