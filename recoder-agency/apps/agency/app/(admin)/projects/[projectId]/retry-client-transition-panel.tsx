"use client";

import { useState, useTransition } from "react";
import type { DeliveryProjectStatus } from "@/db";
import {
	deliveryProjectStatuses,
	deliveryProjectStatusLabels,
} from "@/lib/agency/project-workflow";
import {
	type RetryClientTransitionResult,
	retryClientProjectTransition,
} from "../actions";

interface RetryClientTransitionPanelProps {
	projectId: string;
}

export function RetryClientTransitionPanel({
	projectId,
}: RetryClientTransitionPanelProps) {
	const [result, setResult] = useState<RetryClientTransitionResult | null>(
		null,
	);
	const [selectedStatus, setSelectedStatus] =
		useState<DeliveryProjectStatus>("done");
	const [isPending, startTransition] = useTransition();

	const runRetry = (overrideStatus?: DeliveryProjectStatus) => {
		startTransition(async () => {
			try {
				const response = await retryClientProjectTransition(
					projectId,
					overrideStatus,
				);
				setResult(response);
			} catch (error) {
				setResult({
					ok: false,
					message:
						error instanceof Error
							? error.message
							: "Unable to retry client transition.",
				});
			}
		});
	};

	return (
		<div className="rounded-xl border border-border bg-background p-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-sm font-medium text-text-muted">
						Client Transition Recovery
					</h2>
					<p className="mt-1 text-xs text-text-muted">
						Retry project status progression from deliverable state signals.
					</p>
				</div>
				<button
					type="button"
					onClick={() => runRetry()}
					disabled={isPending}
					className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
				>
					{isPending ? "Retrying..." : "Retry Client Transition"}
				</button>
			</div>
			<div className="mt-3 flex flex-wrap items-center gap-2">
				<select
					data-testid="retry-target-status"
					value={selectedStatus}
					onChange={(event) =>
						setSelectedStatus(event.target.value as DeliveryProjectStatus)
					}
					className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-text"
				>
					{deliveryProjectStatuses.map((status) => (
						<option key={status} value={status}>
							{deliveryProjectStatusLabels[status]}
						</option>
					))}
				</select>
				<button
					type="button"
					onClick={() => runRetry(selectedStatus)}
					disabled={isPending}
					data-testid="retry-target-status-submit"
					className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs text-text hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
				>
					Try Selected Status
				</button>
			</div>

			{result && (
				<div className="mt-3 space-y-2">
					<p
						className={`text-xs ${result.ok ? "text-green-400" : "text-red-400"}`}
					>
						{result.message}
					</p>
					{!result.ok &&
						result.suggestions &&
						result.suggestions.length > 0 && (
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-xs text-text-muted">
									Guided suggestions:
								</span>
								{result.suggestions.map((status) => (
									<button
										key={status}
										type="button"
										onClick={() => runRetry(status)}
										disabled={isPending}
										className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-text hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
									>
										{deliveryProjectStatusLabels[status]}
									</button>
								))}
							</div>
						)}
				</div>
			)}
		</div>
	);
}
