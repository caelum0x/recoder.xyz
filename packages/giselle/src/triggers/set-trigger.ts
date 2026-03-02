import type { Trigger } from "@recoder/protocol";
import type { GiselleContext } from "../types";
import { setTrigger as setTriggerInternal } from "./utils";

export async function setTrigger(args: {
	context: GiselleContext;
	trigger: Trigger;
}) {
	await setTriggerInternal({
		storage: args.context.storage,
		trigger: args.trigger,
	});
}
