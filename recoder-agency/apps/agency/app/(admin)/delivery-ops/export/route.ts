import { NextResponse } from "next/server";
import {
	type DeliveryOpsFilters,
	fetchDeliveryOpsData,
	parseDeliveryOpsFilters,
} from "@/lib/agency/delivery-ops";
import { requireAdminRole } from "@/services/teams";

function escapeCsv(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	const stringValue = String(value);
	if (
		stringValue.includes(",") ||
		stringValue.includes('"') ||
		stringValue.includes("\n")
	) {
		return `"${stringValue.replaceAll('"', '""')}"`;
	}
	return stringValue;
}

function formatDate(value: Date | null): string {
	if (!value) {
		return "";
	}
	return value.toISOString();
}

function buildCsv(
	filters: DeliveryOpsFilters,
	data: Awaited<ReturnType<typeof fetchDeliveryOpsData>>,
) {
	const lines: string[] = [];
	lines.push(
		[
			"row_type",
			"project_id",
			"project_name",
			"client_name",
			"project_status",
			"updated_at",
			"delivery_due_at",
			"is_breached",
			"days_overdue",
			"escalation_owner",
			"escalation_reason",
			"rework_count",
			"last_rework_at",
			"from_status",
			"to_status",
			"forced",
			"actor",
			"reason",
			"created_at",
			"window_days",
			"stuck_days",
			"rework_threshold",
			"min_risk_score",
			"has_forced_only",
			"compare_label",
			"first_pass_approval_rate",
			"forced_transition_rate",
			"client_project_count",
			"client_forced_transition_count",
			"client_risk_score",
			"client_last_transition_at",
		].join(","),
	);

	const baseFilterColumns = [
		filters.windowDays,
		filters.stuckDays,
		filters.reworkThreshold,
		filters.minRiskScore,
		filters.hasForcedOnly ? "1" : "0",
	];

	lines.push(
		[
			"summary",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			"",
			...baseFilterColumns,
			"",
			"",
			"",
			"",
			"",
			"",
			"",
		]
			.map(escapeCsv)
			.join(","),
	);

	for (const row of data.compareWindows) {
		for (const [rowType, snapshot] of [
			["compare_window_current", row.current] as const,
			["compare_window_prior", row.prior] as const,
		]) {
			lines.push(
				[
					rowType,
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					"",
					...baseFilterColumns,
					row.label,
					snapshot.firstPassApprovalRate,
					snapshot.forcedTransitionRate,
					"",
					"",
					"",
					"",
				]
					.map(escapeCsv)
					.join(","),
			);
		}
	}

	for (const row of data.stuckProjects) {
		lines.push(
			[
				"stuck_project",
				row.projectId,
				row.projectName,
				row.clientName,
				row.projectStatus,
				formatDate(row.projectUpdatedAt),
				formatDate(row.deliveryDueAt),
				row.isBreached ? "1" : "0",
				row.daysOverdue ?? "",
				row.escalationOwnerDisplayName ?? row.escalationOwnerEmail ?? "",
				row.escalationReason ?? "",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				...baseFilterColumns,
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
			]
				.map(escapeCsv)
				.join(","),
		);
	}

	for (const row of data.forcedTransitions) {
		lines.push(
			[
				"forced_transition",
				row.projectId,
				row.projectName,
				row.clientName,
				"",
				"",
				"",
				"",
				row.fromStatus,
				row.toStatus,
				"true",
				row.actorDisplayName ?? row.actorEmail ?? "",
				row.reason ?? "",
				formatDate(row.createdAt),
				...baseFilterColumns,
				"",
				"",
				"",
				"",
				"",
				"",
				"",
			]
				.map(escapeCsv)
				.join(","),
		);
	}

	for (const row of data.clientRisk) {
		lines.push(
			[
				"client_risk",
				"",
				"",
				row.clientName,
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				row.reworkCount,
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				...baseFilterColumns,
				"",
				"",
				"",
				row.projectCount,
				row.forcedTransitionCount,
				row.riskScore,
				formatDate(row.lastTransitionAt),
			]
				.map(escapeCsv)
				.join(","),
		);
	}

	for (const row of data.reworkSpikes) {
		lines.push(
			[
				"rework_spike",
				row.projectId,
				row.projectName,
				row.clientName,
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				row.reworkCount,
				formatDate(row.lastReworkAt),
				"client_review",
				"in_progress",
				"",
				"",
				"",
				"",
				...baseFilterColumns,
				"",
				"",
				"",
				"",
				"",
				"",
				"",
			]
				.map(escapeCsv)
				.join(","),
		);
	}

	for (const row of data.breachedProjects) {
		lines.push(
			[
				"sla_breach",
				row.projectId,
				row.projectName,
				row.clientName,
				row.projectStatus,
				"",
				formatDate(row.deliveryDueAt),
				"1",
				row.daysOverdue,
				row.escalationOwnerDisplayName ?? row.escalationOwnerEmail ?? "",
				row.escalationReason ?? "",
				"",
				"",
				"",
				"",
				...baseFilterColumns,
				"",
				"",
				"",
				"",
				"",
				"",
				"",
			]
				.map(escapeCsv)
				.join(","),
		);
	}

	return `${lines.join("\n")}\n`;
}

export async function GET(request: Request) {
	const team = await requireAdminRole();
	const url = new URL(request.url);
	const filters = parseDeliveryOpsFilters({
		windowDays: url.searchParams.get("windowDays") ?? undefined,
		stuckDays: url.searchParams.get("stuckDays") ?? undefined,
		reworkThreshold: url.searchParams.get("reworkThreshold") ?? undefined,
		minRiskScore: url.searchParams.get("minRiskScore") ?? undefined,
		hasForcedOnly: url.searchParams.get("hasForcedOnly") ?? undefined,
	});
	const data = await fetchDeliveryOpsData(team.dbId, filters);
	const csv = buildCsv(filters, data);
	const timestamp = new Date().toISOString().slice(0, 10);

	return new NextResponse(csv, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename=\"delivery-ops-${timestamp}.csv\"`,
		},
	});
}
