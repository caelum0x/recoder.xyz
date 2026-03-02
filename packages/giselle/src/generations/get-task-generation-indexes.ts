import type { TaskId } from "@recoder/protocol";
import { getTask } from "../tasks";
import type { GiselleContext } from "../types";
import { getTaskGenerationIndexes as internal_getTaskGenerationIndexes } from "./internal/get-task-generation-indexes";

export async function getTaskGenerationIndexes({
	taskId,
	context,
}: {
	context: GiselleContext;
	taskId: TaskId;
}) {
	const [task, generationIndexes] = await Promise.all([
		getTask({ taskId, context }),
		internal_getTaskGenerationIndexes({
			taskId,
			storage: context.storage,
		}),
	]);
	return { task, generationIndexes };
}
