import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface CostByCategory {
	labor: number;
	ai_usage: number;
	infrastructure: number;
	tooling: number;
	subcontractor: number;
	other: number;
}

export interface ProjectPnL {
	projectDbId: number;
	projectId: string;
	projectName: string;
	projectStatus: string;
	clientName: string;
	budgetCents: number | null;
	revenueCents: number;
	totalInvoicedCents: number;
	totalCostCents: number;
	costByCategory: CostByCategory;
	grossMarginCents: number;
	grossMarginPct: number | null;
	quotePriceCents: number | null;
}

export interface TeamMarginOverview {
	totalRevenueCents: number;
	totalCostCents: number;
	grossMarginCents: number;
	avgMarginPct: number | null;
	projectCount: number;
	healthyCount: number;
	thinCount: number;
	negativeCount: number;
	noRevenueCount: number;
	projects: ProjectPnL[];
}

function num(value: unknown): number {
	if (value === null || value === undefined) return 0;
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function rowToPnL(row: Record<string, unknown>): ProjectPnL {
	return {
		projectDbId: num(row.project_db_id),
		projectId: String(row.project_id),
		projectName: String(row.project_name),
		projectStatus: String(row.project_status),
		clientName: String(row.client_name),
		budgetCents: numOrNull(row.budget_cents),
		revenueCents: num(row.paid_revenue_cents),
		totalInvoicedCents: num(row.total_invoiced_cents),
		totalCostCents: num(row.total_cost_cents),
		costByCategory: {
			labor: num(row.labor_cents),
			ai_usage: num(row.ai_usage_cents),
			infrastructure: num(row.infrastructure_cents),
			tooling: num(row.tooling_cents),
			subcontractor: num(row.subcontractor_cents),
			other: num(row.other_cents),
		},
		grossMarginCents: num(row.gross_margin_cents),
		grossMarginPct: numOrNull(row.gross_margin_pct),
		quotePriceCents: numOrNull(row.quote_price_cents),
	};
}

export async function getProjectPnL(
	teamDbId: number,
	projectDbId: number,
): Promise<ProjectPnL | null> {
	try {
		const result = await db.execute(sql`
			SELECT *
			FROM "public"."project_unit_economics"
			WHERE team_db_id = ${teamDbId}
				AND project_db_id = ${projectDbId}
			LIMIT 1
		`);

		const row = result.rows[0] as Record<string, unknown> | undefined;
		if (!row) return null;
		return rowToPnL(row);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("project_unit_economics")
		) {
			return null;
		}
		throw error;
	}
}

export async function getTeamMarginOverview(
	teamDbId: number,
): Promise<TeamMarginOverview> {
	const empty: TeamMarginOverview = {
		totalRevenueCents: 0,
		totalCostCents: 0,
		grossMarginCents: 0,
		avgMarginPct: null,
		projectCount: 0,
		healthyCount: 0,
		thinCount: 0,
		negativeCount: 0,
		noRevenueCount: 0,
		projects: [],
	};

	try {
		const result = await db.execute(sql`
			SELECT *
			FROM "public"."project_unit_economics"
			WHERE team_db_id = ${teamDbId}
			ORDER BY paid_revenue_cents DESC
		`);

		const projects = result.rows.map((row) =>
			rowToPnL(row as Record<string, unknown>),
		);

		if (projects.length === 0) return empty;

		let totalRevenueCents = 0;
		let totalCostCents = 0;
		let healthyCount = 0;
		let thinCount = 0;
		let negativeCount = 0;
		let noRevenueCount = 0;

		for (const p of projects) {
			totalRevenueCents += p.revenueCents;
			totalCostCents += p.totalCostCents;

			if (p.grossMarginPct === null) {
				noRevenueCount++;
			} else if (p.grossMarginPct >= 30) {
				healthyCount++;
			} else if (p.grossMarginPct >= 0) {
				thinCount++;
			} else {
				negativeCount++;
			}
		}

		const grossMarginCents = totalRevenueCents - totalCostCents;
		const avgMarginPct =
			totalRevenueCents > 0
				? Math.round((grossMarginCents / totalRevenueCents) * 100 * 100) / 100
				: null;

		return {
			totalRevenueCents,
			totalCostCents,
			grossMarginCents,
			avgMarginPct,
			projectCount: projects.length,
			healthyCount,
			thinCount,
			negativeCount,
			noRevenueCount,
			projects,
		};
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("project_unit_economics")
		) {
			return empty;
		}
		throw error;
	}
}
