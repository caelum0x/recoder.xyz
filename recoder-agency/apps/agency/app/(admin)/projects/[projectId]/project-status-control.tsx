"use client";

import type { ProjectStatus } from "@/db";
import {
	deliveryProjectStatusColors,
	deliveryProjectStatuses,
	deliveryProjectStatusLabels,
	normalizeProjectStatus,
} from "@/lib/agency/project-workflow";
import { forceProjectStatusTransition, updateProjectStatus } from "../actions";

interface ProjectStatusControlProps {
	projectId: string;
	currentStatus: string;
}

export function ProjectStatusControl({
	projectId,
	currentStatus,
}: ProjectStatusControlProps) {
	const normalizedCurrentStatus = normalizeProjectStatus(currentStatus);

	const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
		const nextStatus = e.target.value as ProjectStatus;
		try {
			await updateProjectStatus(projectId, nextStatus);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Status update failed.";
			if (!errorMessage.includes("Status cannot transition")) {
				throw error;
			}

			const confirmForce = window.confirm(
				`Invalid transition. Do you want to force this status change?\n\n${errorMessage}`,
			);
			if (!confirmForce) {
				return;
			}

			const reason = window.prompt(
				"Reason for forced transition (required):",
				"Manual override by operator",
			);
			if (!reason?.trim()) {
				window.alert("Forced transition cancelled: reason is required.");
				return;
			}

			await forceProjectStatusTransition(projectId, nextStatus, reason.trim());
		}
	};

	return (
		<select
			value={normalizedCurrentStatus}
			onChange={handleChange}
			className={`rounded-full px-3 py-1 text-xs font-medium border-0 cursor-pointer ${deliveryProjectStatusColors[normalizedCurrentStatus] ?? "bg-primary/10 text-primary"}`}
		>
			{deliveryProjectStatuses.map((status) => (
				<option key={status} value={status}>
					{deliveryProjectStatusLabels[status]}
				</option>
			))}
		</select>
	);
}
