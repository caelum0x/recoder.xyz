import clsx from "clsx/lite";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

type TooltipProps = Omit<
	ComponentProps<typeof TooltipPrimitive.Trigger>,
	"asChild"
> & {
	children: ReactNode;
	text: ReactNode;
	sideOffset?: number;
	delayDuration?: number;
	className?: string;
	variant?: "light" | "dark";
	side?: "top" | "right" | "bottom" | "left";
	align?: "start" | "center" | "end";
};

export function Tooltip({
	text,
	sideOffset = 8,
	delayDuration = 300,
	className,
	variant = "light",
	side = "top",
	align = "center",
	...props
}: TooltipProps) {
	return (
		<TooltipPrimitive.Provider>
			<TooltipPrimitive.Root delayDuration={delayDuration}>
				<TooltipPrimitive.Trigger asChild {...props} />
				<TooltipPrimitive.Portal>
					<TooltipPrimitive.Content
						data-variant={variant}
						side={side}
						align={align}
						className={clsx(
							"group z-50 overflow-hidden rounded-md px-2 py-1 text-xs shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
							"data-[variant=light]:bg-[#97A2BE] data-[variant=light]:text-black-850",
							"data-[variant=dark]:bg-bg-850 data-[variant=dark]:text-inverse",
							className,
						)}
						sideOffset={sideOffset}
					>
						{text}
					</TooltipPrimitive.Content>
				</TooltipPrimitive.Portal>
			</TooltipPrimitive.Root>
		</TooltipPrimitive.Provider>
	);
}
