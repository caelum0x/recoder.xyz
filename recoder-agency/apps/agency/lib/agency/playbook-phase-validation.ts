import type { PlaybookPhase } from "@/db/schema";

const ALLOWED_PLAYBOOK_DELIVERABLE_TYPES = new Set([
	"document",
	"code",
	"design",
	"other",
] as const);

export function normalizePlaybookPhases(raw: unknown): PlaybookPhase[] {
	if (!Array.isArray(raw)) {
		throw new Error("Phases must be a JSON array.");
	}

	return raw.map((phase, index) => {
		if (typeof phase !== "object" || phase === null) {
			throw new Error(`Phase #${index + 1} must be an object.`);
		}

		const record = phase as Record<string, unknown>;
		const name = String(record.name ?? "").trim();
		if (!name) {
			throw new Error(`Phase #${index + 1} is missing a valid name.`);
		}

		const deliverableType = String(record.deliverableType ?? "").trim();
		if (!ALLOWED_PLAYBOOK_DELIVERABLE_TYPES.has(deliverableType as any)) {
			throw new Error(
				`Phase #${index + 1} has invalid deliverableType "${deliverableType}".`,
			);
		}

		const orderRaw = Number.parseInt(String(record.order ?? index + 1), 10);
		const order = Number.isNaN(orderRaw) ? index + 1 : Math.max(1, orderRaw);

		const isBillableMilestone = Boolean(record.isBillableMilestone);
		const description =
			typeof record.description === "string" &&
			record.description.trim().length > 0
				? record.description.trim()
				: undefined;
		const milestoneLabel =
			typeof record.milestoneLabel === "string" &&
			record.milestoneLabel.trim().length > 0
				? record.milestoneLabel.trim()
				: undefined;

		return {
			order,
			name,
			deliverableType: deliverableType as PlaybookPhase["deliverableType"],
			description,
			isBillableMilestone,
			milestoneLabel,
		} satisfies PlaybookPhase;
	});
}
