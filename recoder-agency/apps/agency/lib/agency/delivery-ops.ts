import { and, desc, eq, gte, sql } from "drizzle-orm";
import { clients, db, projectStatusTransitions, projects, users } from "@/db";
import { type AlertPayload, sendAlert } from "@/lib/agency/alert-sender";

export type DeliveryOpsFilters = {
	windowDays: number;
	stuckDays: number;
	reworkThreshold: number;
	minRiskScore: number;
	hasForcedOnly: boolean;
};

export type StuckProjectRow = {
	projectId: string;
	projectName: string;
	projectStatus: string;
	projectUpdatedAt: Date;
	clientName: string | null;
	deliveryDueAt: Date | null;
	isBreached: boolean;
	escalationOwnerDisplayName: string | null;
	escalationOwnerEmail: string | null;
	escalationReason: string | null;
	daysOverdue: number | null;
};

export type BreachedProjectRow = {
	projectId: string;
	projectName: string;
	projectStatus: string;
	clientName: string | null;
	deliveryDueAt: Date;
	escalationOwnerDisplayName: string | null;
	escalationOwnerEmail: string | null;
	escalationReason: string | null;
	daysOverdue: number;
};

export type ForcedTransitionRow = {
	transitionId: number;
	projectId: string;
	projectName: string;
	clientName: string | null;
	fromStatus: string;
	toStatus: string;
	reason: string | null;
	createdAt: Date;
	actorDisplayName: string | null;
	actorEmail: string | null;
};

export type ReworkSpikeRow = {
	projectId: string;
	projectName: string;
	clientName: string | null;
	reworkCount: number;
	lastReworkAt: Date | null;
};

export type RestoreDrillRow = {
	id: number;
	executedAt: Date;
	operatorName: string;
	backupReference: string;
	validationSummary: string;
};

export type ExceptionQueueKind = "invalid_path" | "forced" | "retry_needed";

export type ExceptionQueueRow = {
	transitionId: number;
	projectId: string;
	projectName: string;
	clientName: string | null;
	kind: ExceptionQueueKind;
	fromStatus: string;
	toStatus: string;
	source: string;
	forced: boolean;
	validationMessage: string | null;
	reason: string | null;
	createdAt: Date;
};

export type DeliveryOpsData = {
	filters: DeliveryOpsFilters;
	stuckProjects: StuckProjectRow[];
	breachedProjects: BreachedProjectRow[];
	forcedTransitions: ForcedTransitionRow[];
	reworkSpikes: ReworkSpikeRow[];
	compareWindows: CompareWindowMetrics[];
	clientRisk: ClientRiskRow[];
	restoreDrills: RestoreDrillRow[];
	exceptionQueue: ExceptionQueueRow[];
};

export type CompareWindowMetrics = {
	label: "7d" | "30d";
	current: WindowMetricSnapshot;
	prior: WindowMetricSnapshot;
};

export type WindowMetricSnapshot = {
	firstPassApprovedProjects: number;
	firstPassTotalProjects: number;
	firstPassApprovalRate: number | null;
	forcedTransitionCount: number;
	transitionCount: number;
	forcedTransitionRate: number | null;
};

export type ClientRiskRow = {
	clientId: string;
	clientName: string;
	projectCount: number;
	reworkCount: number;
	forcedTransitionCount: number;
	riskScore: number;
	lastTransitionAt: Date | null;
};

const FILTER_LIMITS = {
	windowDays: { min: 1, max: 180, default: 30 },
	stuckDays: { min: 1, max: 90, default: 7 },
	reworkThreshold: { min: 1, max: 20, default: 2 },
	minRiskScore: { min: 0, max: 50, default: 0 },
};

function clampInt(
	value: string | undefined,
	opts: { min: number; max: number; default: number },
) {
	const parsed = Number.parseInt(value ?? "", 10);
	if (Number.isNaN(parsed)) {
		return opts.default;
	}
	return Math.min(Math.max(parsed, opts.min), opts.max);
}

export function parseDeliveryOpsFilters(
	params: Partial<Record<string, string | undefined>>,
): DeliveryOpsFilters {
	const hasForcedOnlyRaw = params.hasForcedOnly;
	return {
		windowDays: clampInt(params.windowDays, FILTER_LIMITS.windowDays),
		stuckDays: clampInt(params.stuckDays, FILTER_LIMITS.stuckDays),
		reworkThreshold: clampInt(
			params.reworkThreshold,
			FILTER_LIMITS.reworkThreshold,
		),
		minRiskScore: clampInt(params.minRiskScore, FILTER_LIMITS.minRiskScore),
		hasForcedOnly: hasForcedOnlyRaw === "1" || hasForcedOnlyRaw === "true",
	};
}

export function toDeliveryOpsSearchParams(
	filters: DeliveryOpsFilters,
): URLSearchParams {
	const params = new URLSearchParams();
	params.set("windowDays", String(filters.windowDays));
	params.set("stuckDays", String(filters.stuckDays));
	params.set("reworkThreshold", String(filters.reworkThreshold));
	params.set("minRiskScore", String(filters.minRiskScore));
	if (filters.hasForcedOnly) {
		params.set("hasForcedOnly", "1");
	}
	return params;
}

export async function fetchDeliveryOpsData(
	teamDbId: number,
	filters: DeliveryOpsFilters,
): Promise<DeliveryOpsData> {
	const now = new Date();
	const windowCutoff = new Date(now);
	windowCutoff.setDate(now.getDate() - filters.windowDays);
	const stuckCutoff = new Date(now);
	stuckCutoff.setDate(now.getDate() - filters.stuckDays);

	const [
		stuckProjects,
		breachedProjects,
		forcedTransitionsRaw,
		reworkGroupedRaw,
		compareWindows,
		clientRisk,
		restoreDrills,
		exceptionQueue,
	] = await Promise.all([
		fetchStuckProjects(teamDbId, stuckCutoff, now),
		fetchBreachedProjects(teamDbId, now),
		db
			.select({
				transitionId: projectStatusTransitions.dbId,
				projectId: projects.id,
				projectName: projects.name,
				clientName: clients.name,
				fromStatus: projectStatusTransitions.fromStatus,
				toStatus: projectStatusTransitions.toStatus,
				reason: projectStatusTransitions.reason,
				createdAt: projectStatusTransitions.createdAt,
				actorDisplayName: users.displayName,
				actorEmail: users.email,
			})
			.from(projectStatusTransitions)
			.innerJoin(
				projects,
				eq(projectStatusTransitions.projectDbId, projects.dbId),
			)
			.leftJoin(clients, eq(projects.clientDbId, clients.dbId))
			.leftJoin(users, eq(projectStatusTransitions.actorUserDbId, users.dbId))
			.where(
				and(
					eq(projects.teamDbId, teamDbId),
					gte(projectStatusTransitions.createdAt, windowCutoff),
					sql`coalesce((${projectStatusTransitions.metadata} ->> 'forced')::boolean, false) = true`,
				),
			)
			.orderBy(desc(projectStatusTransitions.createdAt)),
		db
			.select({
				projectId: projects.id,
				projectName: projects.name,
				clientName: clients.name,
				reworkCount: sql<number>`count(*)`,
				lastReworkAt: sql<Date | null>`max(${projectStatusTransitions.createdAt})`,
			})
			.from(projectStatusTransitions)
			.innerJoin(
				projects,
				eq(projectStatusTransitions.projectDbId, projects.dbId),
			)
			.leftJoin(clients, eq(projects.clientDbId, clients.dbId))
			.where(
				and(
					eq(projects.teamDbId, teamDbId),
					eq(projectStatusTransitions.fromStatus, "client_review"),
					eq(projectStatusTransitions.toStatus, "in_progress"),
					gte(projectStatusTransitions.createdAt, windowCutoff),
				),
			)
			.groupBy(projects.id, projects.name, clients.name)
			.orderBy(
				desc(sql`count(*)`),
				desc(sql`max(${projectStatusTransitions.createdAt})`),
			),
		fetchCompareWindowMetrics(teamDbId, now),
		fetchClientRiskRows(teamDbId, windowCutoff),
		fetchRestoreDrillHistory(teamDbId),
		fetchExceptionQueue(teamDbId, windowCutoff),
	]);

	const reworkSpikes = reworkGroupedRaw
		.map((row) => ({
			...row,
			reworkCount: Number(row.reworkCount),
		}))
		.filter((row) => row.reworkCount >= filters.reworkThreshold);
	const filteredClientRisk = clientRisk.filter((row) => {
		if (row.riskScore < filters.minRiskScore) {
			return false;
		}
		if (filters.hasForcedOnly && row.forcedTransitionCount < 1) {
			return false;
		}
		return true;
	});

	return {
		filters,
		stuckProjects,
		breachedProjects,
		forcedTransitions: forcedTransitionsRaw,
		reworkSpikes,
		compareWindows,
		clientRisk: filteredClientRisk,
		restoreDrills,
		exceptionQueue,
	};
}

function toDateOrNull(value: unknown): Date | null {
	if (value instanceof Date) {
		return value;
	}
	if (value === null || value === undefined) {
		return null;
	}
	const parsed = new Date(String(value));
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIntOrNull(value: unknown): number | null {
	if (value === null || value === undefined) {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean {
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "string") {
		return value === "true" || value === "t" || value === "1";
	}
	if (typeof value === "number") {
		return value !== 0;
	}
	return false;
}

async function fetchStuckProjects(
	teamDbId: number,
	stuckCutoff: Date,
	now: Date,
): Promise<StuckProjectRow[]> {
	const rows = await db.execute(sql`
		SELECT
			p.id AS project_id,
			p.name AS project_name,
			p.status AS project_status,
			p.updated_at AS project_updated_at,
			c.name AS client_name,
			p.delivery_due_at AS delivery_due_at,
			CASE
				WHEN p.delivery_due_at IS NOT NULL AND p.delivery_due_at < ${now}
					THEN true
				ELSE false
			END AS is_breached,
			u.display_name AS escalation_owner_display_name,
			u.email AS escalation_owner_email,
			p.escalation_reason AS escalation_reason,
			CASE
				WHEN p.delivery_due_at IS NULL OR p.delivery_due_at >= ${now}
					THEN NULL
				ELSE floor(extract(epoch FROM (${now} - p.delivery_due_at)) / 86400)::int
			END AS days_overdue
		FROM public.projects p
		LEFT JOIN public.clients c
			ON c.db_id = p.client_db_id
		LEFT JOIN public.users u
			ON u.db_id = p.escalation_owner_user_db_id
		WHERE p.team_db_id = ${teamDbId}
			AND p.status IN ('in_progress', 'qa')
			AND p.updated_at <= ${stuckCutoff}
		ORDER BY p.updated_at ASC
	`);

	return rows.rows.map((row) => {
		const record = row as Record<string, unknown>;
		return {
			projectId: String(record.project_id),
			projectName: String(record.project_name),
			projectStatus: String(record.project_status),
			projectUpdatedAt: toDateOrNull(record.project_updated_at) ?? new Date(0),
			clientName:
				record.client_name === null ? null : String(record.client_name),
			deliveryDueAt: toDateOrNull(record.delivery_due_at),
			isBreached: toBoolean(record.is_breached),
			escalationOwnerDisplayName:
				record.escalation_owner_display_name === null
					? null
					: String(record.escalation_owner_display_name),
			escalationOwnerEmail:
				record.escalation_owner_email === null
					? null
					: String(record.escalation_owner_email),
			escalationReason:
				record.escalation_reason === null
					? null
					: String(record.escalation_reason),
			daysOverdue: toIntOrNull(record.days_overdue),
		};
	});
}

async function fetchBreachedProjects(
	teamDbId: number,
	now: Date,
): Promise<BreachedProjectRow[]> {
	const rows = await db.execute(sql`
		SELECT
			p.id AS project_id,
			p.name AS project_name,
			p.status AS project_status,
			c.name AS client_name,
			p.delivery_due_at AS delivery_due_at,
			u.display_name AS escalation_owner_display_name,
			u.email AS escalation_owner_email,
			p.escalation_reason AS escalation_reason,
			floor(extract(epoch FROM (${now} - p.delivery_due_at)) / 86400)::int AS days_overdue
		FROM public.projects p
		LEFT JOIN public.clients c
			ON c.db_id = p.client_db_id
		LEFT JOIN public.users u
			ON u.db_id = p.escalation_owner_user_db_id
		WHERE p.team_db_id = ${teamDbId}
			AND p.status IN ('in_progress', 'qa', 'client_review', 'blocked')
			AND p.delivery_due_at IS NOT NULL
			AND p.delivery_due_at < ${now}
		ORDER BY p.delivery_due_at ASC
		LIMIT 50
	`);

	return rows.rows.flatMap((row) => {
		const record = row as Record<string, unknown>;
		const deliveryDueAt = toDateOrNull(record.delivery_due_at);
		const daysOverdue = toIntOrNull(record.days_overdue);
		if (!deliveryDueAt || daysOverdue === null) {
			return [];
		}
		return [
			{
				projectId: String(record.project_id),
				projectName: String(record.project_name),
				projectStatus: String(record.project_status),
				clientName:
					record.client_name === null ? null : String(record.client_name),
				deliveryDueAt,
				escalationOwnerDisplayName:
					record.escalation_owner_display_name === null
						? null
						: String(record.escalation_owner_display_name),
				escalationOwnerEmail:
					record.escalation_owner_email === null
						? null
						: String(record.escalation_owner_email),
				escalationReason:
					record.escalation_reason === null
						? null
						: String(record.escalation_reason),
				daysOverdue,
			},
		];
	});
}

function toRate(numerator: number, denominator: number): number | null {
	if (denominator <= 0) {
		return null;
	}
	return Number(((numerator / denominator) * 100).toFixed(2));
}

function emptyWindowSnapshot(): WindowMetricSnapshot {
	return {
		firstPassApprovedProjects: 0,
		firstPassTotalProjects: 0,
		firstPassApprovalRate: null,
		forcedTransitionCount: 0,
		transitionCount: 0,
		forcedTransitionRate: null,
	};
}

function asNumber(value: unknown): number {
	const parsed = Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchWindowSnapshot(
	teamDbId: number,
	startDate: Date,
	endDate: Date,
): Promise<WindowMetricSnapshot> {
	try {
		const result = await db.execute(sql`
			SELECT
				coalesce(sum(first_pass_approved_projects), 0) AS first_pass_approved_projects,
				coalesce(sum(first_pass_total_projects), 0) AS first_pass_total_projects,
				coalesce(sum(forced_transition_count), 0) AS forced_transition_count,
				coalesce(sum(transition_count), 0) AS transition_count
			FROM public.weekly_delivery_metrics
			WHERE team_db_id = ${teamDbId}
				AND week_start >= ${startDate}
				AND week_start < ${endDate}
		`);
		const row = (result.rows[0] ?? {}) as Record<string, unknown>;
		const firstPassApprovedProjects = asNumber(
			row.first_pass_approved_projects,
		);
		const firstPassTotalProjects = asNumber(row.first_pass_total_projects);
		const forcedTransitionCount = asNumber(row.forced_transition_count);
		const transitionCount = asNumber(row.transition_count);
		return {
			firstPassApprovedProjects,
			firstPassTotalProjects,
			firstPassApprovalRate: toRate(
				firstPassApprovedProjects,
				firstPassTotalProjects,
			),
			forcedTransitionCount,
			transitionCount,
			forcedTransitionRate: toRate(forcedTransitionCount, transitionCount),
		};
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("weekly_delivery_metrics")
		) {
			return emptyWindowSnapshot();
		}
		throw error;
	}
}

function fetchCompareWindowMetrics(
	teamDbId: number,
	now: Date,
): Promise<CompareWindowMetrics[]> {
	const build = async (
		label: "7d" | "30d",
		windowDays: number,
	): Promise<CompareWindowMetrics> => {
		const currentStart = new Date(now);
		currentStart.setDate(currentStart.getDate() - windowDays);
		const priorStart = new Date(currentStart);
		priorStart.setDate(priorStart.getDate() - windowDays);
		const [current, prior] = await Promise.all([
			fetchWindowSnapshot(teamDbId, currentStart, now),
			fetchWindowSnapshot(teamDbId, priorStart, currentStart),
		]);
		return {
			label,
			current,
			prior,
		};
	};

	return Promise.all([build("7d", 7), build("30d", 30)]);
}

async function fetchClientRiskRows(
	teamDbId: number,
	windowCutoff: Date,
): Promise<ClientRiskRow[]> {
	const rows = await db.execute(sql`
		WITH rework AS (
			SELECT
				p.client_db_id,
				count(*)::int AS rework_count,
				max(pst.created_at) AS last_rework_at
			FROM public.project_status_transitions pst
			INNER JOIN public.projects p
				ON p.db_id = pst.project_db_id
			WHERE p.team_db_id = ${teamDbId}
				AND pst.created_at >= ${windowCutoff}
				AND pst.from_status = 'client_review'
				AND pst.to_status = 'in_progress'
			GROUP BY p.client_db_id
		),
		forced AS (
			SELECT
				p.client_db_id,
				count(*)::int AS forced_transition_count,
				max(pst.created_at) AS last_forced_at
			FROM public.project_status_transitions pst
			INNER JOIN public.projects p
				ON p.db_id = pst.project_db_id
			WHERE p.team_db_id = ${teamDbId}
				AND pst.created_at >= ${windowCutoff}
				AND coalesce((pst.metadata->>'forced')::boolean, false) = true
			GROUP BY p.client_db_id
		),
		project_counts AS (
			SELECT
				p.client_db_id,
				count(*)::int AS project_count
			FROM public.projects p
			WHERE p.team_db_id = ${teamDbId}
			GROUP BY p.client_db_id
		)
		SELECT
			c.id AS client_id,
			c.name AS client_name,
			coalesce(pc.project_count, 0)::int AS project_count,
			coalesce(r.rework_count, 0)::int AS rework_count,
			coalesce(f.forced_transition_count, 0)::int AS forced_transition_count,
			(coalesce(r.rework_count, 0) + (coalesce(f.forced_transition_count, 0) * 2))::int AS risk_score,
			CASE
				WHEN r.last_rework_at IS NULL AND f.last_forced_at IS NULL THEN NULL
				ELSE greatest(
					coalesce(r.last_rework_at, to_timestamp(0)),
					coalesce(f.last_forced_at, to_timestamp(0))
				)
			END AS last_transition_at
		FROM public.clients c
		LEFT JOIN project_counts pc
			ON pc.client_db_id = c.db_id
		LEFT JOIN rework r
			ON r.client_db_id = c.db_id
		LEFT JOIN forced f
			ON f.client_db_id = c.db_id
		WHERE c.team_db_id = ${teamDbId}
		ORDER BY risk_score DESC, forced_transition_count DESC, rework_count DESC, client_name ASC
		LIMIT 10
	`);

	return rows.rows.map((row) => {
		const record = row as Record<string, unknown>;
		const lastTransitionRaw = record.last_transition_at;
		const lastTransitionAt =
			lastTransitionRaw instanceof Date
				? lastTransitionRaw
				: lastTransitionRaw
					? new Date(String(lastTransitionRaw))
					: null;

		return {
			clientId: String(record.client_id),
			clientName: String(record.client_name),
			projectCount: asNumber(record.project_count),
			reworkCount: asNumber(record.rework_count),
			forcedTransitionCount: asNumber(record.forced_transition_count),
			riskScore: asNumber(record.risk_score),
			lastTransitionAt:
				lastTransitionAt && !Number.isNaN(lastTransitionAt.getTime())
					? lastTransitionAt
					: null,
		};
	});
}

async function fetchRestoreDrillHistory(
	teamDbId: number,
): Promise<RestoreDrillRow[]> {
	try {
		const result = await db.execute(sql`
			SELECT
				id,
				executed_at,
				operator_name,
				backup_reference,
				validation_summary
			FROM public.ops_restore_drills
			WHERE team_db_id = ${teamDbId} OR team_db_id IS NULL
			ORDER BY executed_at DESC
			LIMIT 20
		`);

		return result.rows.map((row) => {
			const record = row as Record<string, unknown>;
			return {
				id: Number(record.id),
				executedAt: toDateOrNull(record.executed_at) ?? new Date(0),
				operatorName: String(record.operator_name),
				backupReference: String(record.backup_reference),
				validationSummary: String(record.validation_summary),
			};
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("ops_restore_drills")
		) {
			return [];
		}
		throw error;
	}
}

async function fetchExceptionQueue(
	teamDbId: number,
	windowCutoff: Date,
): Promise<ExceptionQueueRow[]> {
	const rows = await db.execute(sql`
		SELECT
			pst.db_id AS transition_id,
			p.id AS project_id,
			p.name AS project_name,
			c.name AS client_name,
			pst.from_status,
			pst.to_status,
			pst.reason,
			pst.created_at,
			coalesce(pst.metadata->>'source', 'unknown') AS source,
			coalesce((pst.metadata->>'forced')::boolean, false) AS forced,
			nullif(pst.metadata->>'validationMessage', '') AS validation_message,
			CASE
				WHEN nullif(pst.metadata->>'validationMessage', '') ILIKE 'Invalid%' THEN 'invalid_path'
				WHEN coalesce((pst.metadata->>'forced')::boolean, false) = true THEN 'forced'
				WHEN coalesce(pst.metadata->>'source', '') = 'client.portal.deliverables.review'
					AND pst.to_status = 'in_progress'
					THEN 'retry_needed'
				ELSE NULL
			END AS kind
		FROM public.project_status_transitions pst
		INNER JOIN public.projects p
			ON p.db_id = pst.project_db_id
		LEFT JOIN public.clients c
			ON c.db_id = p.client_db_id
		WHERE p.team_db_id = ${teamDbId}
			AND pst.created_at >= ${windowCutoff}
			AND (
				nullif(pst.metadata->>'validationMessage', '') ILIKE 'Invalid%'
				OR coalesce((pst.metadata->>'forced')::boolean, false) = true
				OR (
					coalesce(pst.metadata->>'source', '') = 'client.portal.deliverables.review'
					AND pst.to_status = 'in_progress'
				)
			)
		ORDER BY pst.created_at DESC
		LIMIT 20
	`);

	return rows.rows.flatMap((row) => {
		const record = row as Record<string, unknown>;
		const kind = record.kind;
		if (
			kind !== "invalid_path" &&
			kind !== "forced" &&
			kind !== "retry_needed"
		) {
			return [];
		}

		return [
			{
				transitionId: asNumber(record.transition_id),
				projectId: String(record.project_id),
				projectName: String(record.project_name),
				clientName:
					record.client_name === null ? null : String(record.client_name),
				kind,
				fromStatus: String(record.from_status),
				toStatus: String(record.to_status),
				source: String(record.source),
				forced: toBoolean(record.forced),
				validationMessage:
					record.validation_message === null
						? null
						: String(record.validation_message),
				reason: record.reason === null ? null : String(record.reason),
				createdAt: toDateOrNull(record.created_at) ?? new Date(0),
			},
		];
	});
}

export async function checkAndFireAlerts(
	teamDbId: number,
	data: DeliveryOpsData,
): Promise<void> {
	if (data.breachedProjects.length > 0) {
		await sendAlert(teamDbId, {
			eventType: "sla_breach",
			title: `${data.breachedProjects.length} SLA breach(es) detected`,
			details: "The following projects have passed their delivery due date.",
			items: data.breachedProjects.slice(0, 10).map((p) => ({
				label: p.projectName,
				value: `${p.daysOverdue}d overdue (${p.clientName ?? "Unknown client"})`,
			})),
		});
	}

	if (data.stuckProjects.length > 0) {
		await sendAlert(teamDbId, {
			eventType: "stuck_project",
			title: `${data.stuckProjects.length} stuck project(s)`,
			details:
				"These projects have not been updated beyond the stuck threshold.",
			items: data.stuckProjects.slice(0, 10).map((p) => ({
				label: p.projectName,
				value: `${p.projectStatus} since ${new Date(p.projectUpdatedAt).toLocaleDateString()} (${p.clientName ?? "Unknown client"})`,
			})),
		});
	}

	if (data.reworkSpikes.length > 0) {
		await sendAlert(teamDbId, {
			eventType: "rework_spike",
			title: `${data.reworkSpikes.length} rework spike(s)`,
			details:
				"These projects have been sent back from client review multiple times.",
			items: data.reworkSpikes.slice(0, 10).map((p) => ({
				label: p.projectName,
				value: `${p.reworkCount} rework cycles (${p.clientName ?? "Unknown client"})`,
			})),
		});
	}
}
