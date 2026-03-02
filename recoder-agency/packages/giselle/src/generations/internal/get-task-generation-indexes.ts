import type { TaskId } from "@recoder/protocol";
import { NodeGenerationIndex } from "@recoder/protocol";
import type { GiselleStorage } from "@recoder/storage";
import { taskGenerationIndexesPath } from "../../path";

export async function getTaskGenerationIndexes(args: {
	taskId: TaskId;
	storage: GiselleStorage;
}) {
	if (!(await args.storage.exists(taskGenerationIndexesPath(args.taskId)))) {
		return undefined;
	}
	return await args.storage.getJson({
		path: taskGenerationIndexesPath(args.taskId),
		schema: NodeGenerationIndex.array(),
	});
}
