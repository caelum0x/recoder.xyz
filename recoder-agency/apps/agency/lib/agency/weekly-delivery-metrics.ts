import { sql } from "drizzle-orm";
import { db } from "@/db";

export type WeeklyDeliveryMetricsSnapshot = {
	weekStart: string;
	completedProjectsCount: number;
	avgCycleTimeHours: number | null;
	firstPassApprovedProjects: number;
	firstPassTotalProjects: number;
	firstPassApprovalRate: number | null;
	forcedTransitionCount: number;
	transitionCount: number;
	forcedTransitionRate: number | null;
	costWarningBreachCount: number;
	costHardStopBreachCount: number;
};

export type WeeklyDeliveryMetricsFreshness = {
	maxWeekStart: string | null;
	rowCount: number;
};

export type ProjectUnitEconomicsRow = {
	projectDbId: number;
	projectId: string;
	projectName: string;
	projectStatus: string;
	clientName: string;
	budgetCents: number | null;
	paidRevenueCents: number;
	totalInvoicedCents: number;
	totalCostCents: number;
	laborCents: number;
	aiUsageCents: number;
	infrastructureCents: number;
	toolingCents: number;
	subcontractorCents: number;
	otherCents: number;
	grossMarginCents: number;
	grossMarginPct: number | null;
	quotePriceCents: number | null;
};

function parseNumber(value: unknown): number | null {
	if (value === null || value === undefined) {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchLatestWeeklyDeliveryMetrics(
	teamDbId: number,
): Promise<WeeklyDeliveryMetricsSnapshot | null> {
	try {
		const result = await db.execute(sql`
			SELECT
				week_start::text AS week_start,
				completed_projects_count,
				avg_cycle_time_hours,
				first_pass_approved_projects,
				first_pass_total_projects,
				first_pass_approval_rate,
				forced_transition_count,
				transition_count,
				forced_transition_rate,
				cost_warning_breach_count,
				cost_hard_stop_breach_count
			FROM "public"."weekly_delivery_metrics"
			WHERE team_db_id = ${teamDbId}
			ORDER BY week_start DESC
			LIMIT 1
		`);

		const row = result.rows[0] as Record<string, unknown> | undefined;
		if (!row) {
			return null;
		}

		return {
			weekStart: String(row.week_start),
			completedProjectsCount: parseNumber(row.completed_projects_count) ?? 0,
			avgCycleTimeHours: parseNumber(row.avg_cycle_time_hours),
			firstPassApprovedProjects:
				parseNumber(row.first_pass_approved_projects) ?? 0,
			firstPassTotalProjects: parseNumber(row.first_pass_total_projects) ?? 0,
			firstPassApprovalRate: parseNumber(row.first_pass_approval_rate),
			forcedTransitionCount: parseNumber(row.forced_transition_count) ?? 0,
			transitionCount: parseNumber(row.transition_count) ?? 0,
			forcedTransitionRate: parseNumber(row.forced_transition_rate),
			costWarningBreachCount: parseNumber(row.cost_warning_breach_count) ?? 0,
			costHardStopBreachCount:
				parseNumber(row.cost_hard_stop_breach_count) ?? 0,
		};
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("weekly_delivery_metrics")
		) {
			return null;
		}
		throw error;
	}
}

export async function fetchWeeklyDeliveryMetricsFreshness(
	teamDbId: number,
): Promise<WeeklyDeliveryMetricsFreshness | null> {
	try {
		const result = await db.execute(sql`
			SELECT
				max(week_start)::text AS max_week_start,
				count(*)::int AS row_count
			FROM "public"."weekly_delivery_metrics"
			WHERE team_db_id = ${teamDbId}
		`);
		const row = result.rows[0] as Record<string, unknown> | undefined;
		if (!row) {
			return null;
		}
		const rowCount = parseNumber(row.row_count) ?? 0;
		return {
			maxWeekStart:
				row.max_week_start === null ? null : String(row.max_week_start),
			rowCount,
		};
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("weekly_delivery_metrics")
		) {
			return null;
		}
		throw error;
	}
}

export async function fetchProjectUnitEconomicsRows(
	teamDbId: number,
	limit = 8,
): Promise<ProjectUnitEconomicsRow[]> {
	try {
		const safeLimit = Number.isFinite(limit)
			? Math.min(Math.max(Math.trunc(limit), 1), 50)
			: 8;
		const result = await db.execute(sql`
			SELECT
				project_db_id,
				project_id,
				project_name,
				project_status,
				client_name,
				budget_cents,
				paid_revenue_cents,
				total_invoiced_cents,
				total_cost_cents,
				labor_cents,
				ai_usage_cents,
				infrastructure_cents,
				tooling_cents,
				subcontractor_cents,
				other_cents,
				gross_margin_cents,
				gross_margin_pct,
				quote_price_cents
			FROM "public"."project_unit_economics"
			WHERE team_db_id = ${teamDbId}
			ORDER BY
				coalesce(gross_margin_cents, 0) ASC,
				paid_revenue_cents DESC
			LIMIT ${safeLimit}
		`);

		return result.rows.map((row) => {
			const parsed = row as Record<string, unknown>;
			return {
				projectDbId: parseNumber(parsed.project_db_id) ?? 0,
				projectId: String(parsed.project_id ?? ""),
				projectName: String(parsed.project_name ?? "Untitled Project"),
				projectStatus: String(parsed.project_status ?? "queued"),
				clientName: String(parsed.client_name ?? ""),
				budgetCents: parseNumber(parsed.budget_cents),
				paidRevenueCents: parseNumber(parsed.paid_revenue_cents) ?? 0,
				totalInvoicedCents: parseNumber(parsed.total_invoiced_cents) ?? 0,
				totalCostCents: parseNumber(parsed.total_cost_cents) ?? 0,
				laborCents: parseNumber(parsed.labor_cents) ?? 0,
				aiUsageCents: parseNumber(parsed.ai_usage_cents) ?? 0,
				infrastructureCents: parseNumber(parsed.infrastructure_cents) ?? 0,
				toolingCents: parseNumber(parsed.tooling_cents) ?? 0,
				subcontractorCents: parseNumber(parsed.subcontractor_cents) ?? 0,
				otherCents: parseNumber(parsed.other_cents) ?? 0,
				grossMarginCents: parseNumber(parsed.gross_margin_cents) ?? 0,
				grossMarginPct: parseNumber(parsed.gross_margin_pct),
				quotePriceCents: parseNumber(parsed.quote_price_cents),
			};
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("project_unit_economics")
		) {
			return [];
		}
		throw error;
	}
}
