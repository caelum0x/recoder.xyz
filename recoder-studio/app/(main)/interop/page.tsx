import { notFound } from "next/navigation";
import { getStudioInteropRolloutConfig } from "@/flags";
import { InteropClient } from "./interop-client";

export default async function InteropPage() {
	const rollout = await getStudioInteropRolloutConfig();
	if (!rollout.mvpFlag || rollout.killSwitch || rollout.stage === "off") {
		return notFound();
	}

	return <InteropClient />;
}
