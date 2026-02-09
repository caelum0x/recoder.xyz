import { sql } from "drizzle-orm";
import { db } from "@/db";

type DeliverableQaInput = {
	teamDbId: number;
	deliverableType: string;
	deliverableName: string;
	content: string | null;
	fileKey: string | null;
};

type DeliverableQaTemplate = {
	deliverableType: string;
	minContentLength: number;
	requiresFile: boolean;
	checklistItems: string[];
};

export type DeliverableQaResult = {
	passed: boolean;
	failures: string[];
	template: DeliverableQaTemplate;
};

const FALLBACK_TEMPLATE_BY_TYPE: Record<string, DeliverableQaTemplate> = {
	document: {
		deliverableType: "document",
		minContentLength: 80,
		requiresFile: false,
		checklistItems: ["summary", "scope", "next steps"],
	},
	code: {
		deliverableType: "code",
		minContentLength: 40,
		requiresFile: false,
		checklistItems: ["setup", "run", "tests"],
	},
	design: {
		deliverableType: "design",
		minContentLength: 40,
		requiresFile: false,
		checklistItems: ["assets", "handoff", "responsive"],
	},
	other: {
		deliverableType: "other",
		minContentLength: 20,
		requiresFile: false,
		checklistItems: [],
	},
};

function toChecklistItems(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((item) => (typeof item === "string" ? item.trim() : ""))
		.filter((item) => item.length > 0);
}

function toTemplate(record: Record<string, unknown>): DeliverableQaTemplate {
	return {
		deliverableType: String(record.deliverable_type),
		minContentLength: Math.max(0, Number(record.min_content_length ?? 0)),
		requiresFile: record.requires_file === true,
		checklistItems: toChecklistItems(record.checklist_items),
	};
}

async function fetchTeamTemplate(
	teamDbId: number,
	deliverableType: string,
): Promise<DeliverableQaTemplate | null> {
	const result = await db.execute(sql`
		SELECT
			deliverable_type,
			min_content_length,
			requires_file,
			checklist_items
		FROM public.deliverable_definition_of_done_templates
		WHERE team_db_id = ${teamDbId}
			AND deliverable_type = ${deliverableType}
			AND is_active = true
		LIMIT 1
	`);

	const row = result.rows[0] as Record<string, unknown> | undefined;
	return row ? toTemplate(row) : null;
}

export async function evaluateDeliverableQaGate(
	input: DeliverableQaInput,
): Promise<DeliverableQaResult> {
	const template =
		(await fetchTeamTemplate(input.teamDbId, input.deliverableType)) ??
		FALLBACK_TEMPLATE_BY_TYPE[input.deliverableType] ??
		FALLBACK_TEMPLATE_BY_TYPE.other;
	const failures: string[] = [];
	const normalizedName = input.deliverableName.trim();
	const content = (input.content ?? "").trim();
	const contentLower = content.toLowerCase();

	if (!normalizedName) {
		failures.push("Deliverable name is required.");
	}

	if (content.length < template.minContentLength) {
		failures.push(
			`Content must be at least ${template.minContentLength} characters.`,
		);
	}

	if (template.requiresFile && !input.fileKey) {
		failures.push(
			"A file upload is required by the Definition of Done template.",
		);
	}

	for (const checklistItem of template.checklistItems) {
		if (!contentLower.includes(checklistItem.toLowerCase())) {
			failures.push(`Missing checklist item in content: "${checklistItem}".`);
		}
	}

	return {
		passed: failures.length === 0,
		failures,
		template,
	};
}

export async function recordDeliverableQaGateRun({
	teamDbId,
	projectDbId,
	deliverableDbId,
	actorUserDbId,
	result,
	forcedOverride,
}: {
	teamDbId: number;
	projectDbId: number;
	deliverableDbId: number;
	actorUserDbId: number | null;
	result: DeliverableQaResult;
	forcedOverride: boolean;
}) {
	const id = `qagr_${crypto.randomUUID()}`;
	await db.execute(sql`
		INSERT INTO public.deliverable_qa_gate_runs (
			id,
			team_db_id,
			project_db_id,
			deliverable_db_id,
			actor_user_db_id,
			passed,
			forced_override,
			failure_reasons,
			template_snapshot
		) VALUES (
			${id},
			${teamDbId},
			${projectDbId},
			${deliverableDbId},
			${actorUserDbId},
			${result.passed},
			${forcedOverride},
			${JSON.stringify(result.failures)}::jsonb,
			${JSON.stringify(result.template)}::jsonb
		)
	`);
}
