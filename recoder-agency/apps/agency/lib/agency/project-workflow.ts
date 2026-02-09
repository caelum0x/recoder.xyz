import type { DeliveryProjectStatus, ProjectStatus } from "@/db";

export const deliveryProjectStatuses: DeliveryProjectStatus[] = [
	"queued",
	"in_progress",
	"qa",
	"client_review",
	"done",
	"blocked",
];

export const deliveryProjectStatusLabels: Record<
	DeliveryProjectStatus,
	string
> = {
	queued: "Queued",
	in_progress: "In Progress",
	qa: "QA",
	client_review: "Client Review",
	done: "Done",
	blocked: "Blocked",
};

export const deliveryProjectStatusColors: Record<
	DeliveryProjectStatus,
	string
> = {
	queued: "bg-slate-500/10 text-slate-400",
	in_progress: "bg-blue-500/10 text-blue-400",
	qa: "bg-purple-500/10 text-purple-400",
	client_review: "bg-amber-500/10 text-amber-400",
	done: "bg-green-500/10 text-green-400",
	blocked: "bg-red-500/10 text-red-400",
};

export function normalizeProjectStatus(
	status: ProjectStatus | string,
): DeliveryProjectStatus {
	switch (status) {
		case "draft":
			return "queued";
		case "review":
			return "client_review";
		case "completed":
			return "done";
		case "queued":
		case "in_progress":
		case "qa":
		case "client_review":
		case "done":
		case "blocked":
			return status;
		default:
			return "queued";
	}
}

const allowedTransitions: Record<
	DeliveryProjectStatus,
	DeliveryProjectStatus[]
> = {
	queued: ["in_progress", "blocked"],
	in_progress: ["qa", "blocked"],
	qa: ["in_progress", "client_review", "blocked"],
	client_review: ["in_progress", "done", "blocked"],
	done: [],
	blocked: ["queued", "in_progress", "qa"],
};

export function getAllowedProjectStatusTransitions(
	status: DeliveryProjectStatus,
): DeliveryProjectStatus[] {
	return allowedTransitions[status];
}

export function isValidProjectStatusTransition(
	from: DeliveryProjectStatus,
	to: DeliveryProjectStatus,
): boolean {
	if (from === to) {
		return true;
	}
	return allowedTransitions[from].includes(to);
}

export function validateProjectStatusTransition(
	from: DeliveryProjectStatus,
	to: DeliveryProjectStatus,
): { valid: boolean; message?: string } {
	if (isValidProjectStatusTransition(from, to)) {
		return { valid: true };
	}

	const allowed = getAllowedProjectStatusTransitions(from)
		.map((status) => deliveryProjectStatusLabels[status])
		.join(", ");

	if (!allowed) {
		return {
			valid: false,
			message: `Status cannot transition from ${deliveryProjectStatusLabels[from]}.`,
		};
	}

	return {
		valid: false,
		message: `Status cannot transition from ${deliveryProjectStatusLabels[from]} to ${deliveryProjectStatusLabels[to]}. Allowed: ${allowed}.`,
	};
}
