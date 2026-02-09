import clsx from "clsx/lite";
import type { ReactNode } from "react";

function _CategoryTab({
	isActive,
	children,
	onClick,
}: {
	isActive: boolean;
	children: ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={clsx(
				"flex px-[8px] py-[6px] justify-center items-center gap-[10px] rounded-[4px] text-[14px] font-medium",
				isActive
					? "bg-primary-700 text-inverse"
					: "bg-bg-800/50 text-inverse hover:bg-bg-800/80 hover:text-inverse",
			)}
		>
			{children}
		</button>
	);
}
