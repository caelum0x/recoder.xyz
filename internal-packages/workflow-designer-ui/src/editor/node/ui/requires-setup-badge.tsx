import { CircleAlertIcon } from "lucide-react";
import type { ReactElement } from "react";

export function RequiresSetupBadge(): ReactElement {
	return (
		<div className="flex items-center justify-center">
			<div className="inline-flex items-center justify-center text-slate-400 font-semibold rounded-full text-[12px] pl-[10px] pr-[12px] py-2 gap-[6px] animate-pulse [animation-duration:2s]">
				<CircleAlertIcon className="size-[18px]" />
				<span>REQUIRES SETUP</span>
			</div>
		</div>
	);
}
