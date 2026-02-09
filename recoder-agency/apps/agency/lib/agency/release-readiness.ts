import { sql } from "drizzle-orm";
import { db } from "@/db";

function parseNumber(value: unknown): number | null {
	if (value === null || value === undefined) {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

export type RestoreDrillReadiness = {
	lastExecutedAt: string | null;
	rowCount: number;
	ageDays: number | null;
	isStale: boolean;
	thresholdDays: number;
};

export type AuditGuardReadiness = {
	triggerInstalled: boolean;
	functionInstalled: boolean;
};

export async function fetchRestoreDrillReadiness(
	thresholdDays: number,
): Promise<RestoreDrillReadiness | null> {
	try {
		const result = await db.execute(sql`
			SELECT
				max(executed_at)::text AS last_executed_at,
				count(*)::int AS row_count
			FROM "public"."ops_restore_drills"
		`);
		const row = result.rows[0] as Record<string, unknown> | undefined;
		if (!row) {
			return null;
		}

		const rowCount = parseNumber(row.row_count) ?? 0;
		const lastExecutedAt =
			row.last_executed_at === null ? null : String(row.last_executed_at);
		const ageDays =
			lastExecutedAt === null
				? null
				: Math.floor(
						Math.max(0, Date.now() - new Date(lastExecutedAt).getTime()) /
							1000 /
							60 /
							60 /
							24,
					);

		return {
			lastExecutedAt,
			rowCount,
			ageDays,
			isStale: ageDays !== null ? ageDays > thresholdDays : true,
			thresholdDays,
		};
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("ops_restore_drills")
		) {
			return null;
		}
		throw error;
	}
}

export async function fetchAuditGuardReadiness(): Promise<AuditGuardReadiness | null> {
	try {
		const result = await db.execute(sql`
			SELECT
				exists(
					SELECT 1
					FROM pg_trigger t
					INNER JOIN pg_class c ON c.oid = t.tgrelid
					INNER JOIN pg_namespace n ON n.oid = c.relnamespace
					WHERE t.tgname = 'projects_status_audit_guard_trg'
						AND n.nspname = 'public'
						AND c.relname = 'projects'
						AND NOT t.tgisinternal
				) AS trigger_installed,
				exists(
					SELECT 1
					FROM pg_proc p
					INNER JOIN pg_namespace n ON n.oid = p.pronamespace
					WHERE p.proname = 'guard_project_status_update_with_audit'
						AND n.nspname = 'public'
				) AS function_installed
		`);
		const row = result.rows[0] as Record<string, unknown> | undefined;
		if (!row) {
			return null;
		}
		return {
			triggerInstalled: Boolean(row.trigger_installed),
			functionInstalled: Boolean(row.function_installed),
		};
	} catch (error) {
		if (error instanceof Error && error.message.includes("pg_trigger")) {
			return null;
		}
		throw error;
	}
}
