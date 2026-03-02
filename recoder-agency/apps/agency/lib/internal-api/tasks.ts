"use server";

import type { CreateTaskInputs, StartTaskInputs } from "@recoder/giselle";
import type { TaskId, WorkspaceId } from "@recoder/protocol";
import { giselle } from "@/app/giselle";

export async function createTask(input: CreateTaskInputs) {
	return await giselle.createTask(input);
}

export async function startTask(input: StartTaskInputs) {
	await giselle.startTask(input);
}

export async function getWorkspaceInprogressTask(input: {
	workspaceId: WorkspaceId;
}) {
	const task = await giselle.getWorkspaceInprogressTask(input);
	return { task };
}

export async function getTaskGenerationIndexes(input: { taskId: TaskId }) {
	return await giselle.getTaskGenerationIndexes(input);
}

export async function getWorkspaceTasks(input: { workspaceId: WorkspaceId }) {
	const tasks = await giselle.getWorkspaceTasks({
		workspaceId: input.workspaceId,
	});
	return { tasks };
}
