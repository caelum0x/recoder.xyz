import { DocsLink } from "@giselle-internal/ui/docs-link";
import { PageHeading } from "@giselle-internal/ui/page-heading";
import { StatusBadge } from "@giselle-internal/ui/status-badge";
import type { Task, TaskId as TaskIdType } from "@giselles-ai/protocol";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { createSearchParamsCache, parseAsInteger } from "nuqs/server";
import { giselle } from "@/app/giselle";
import { db } from "@/db";
import { fetchCurrentTeam } from "@/services/teams/fetch-current-team";
import { Card } from "../settings/components/card";
import { LocalDateTime } from "../settings/team/components/local-date-time";

interface UITaskListAppOrigin {
	type: "app";
	appName: string;
}
interface UITaskListGitHubOrigin {
	type: "github";
	repoName: string;
}
type UITaskListOrigin = UITaskListAppOrigin | UITaskListGitHubOrigin;

interface UITaskListRow {
	id: TaskIdType;
	startedAt: number;
	status: Task["status"];
	inputSummary: string | null;
	llmModels: string[];
	origin: UITaskListOrigin;
}

function truncateText(value: string, maxLength = 120) {
	if (value.length <= maxLength) {
		return value;
	}
	return `${value.slice(0, maxLength - 1)}…`;
}

function summarizeUnknownInput(value: unknown): string | null {
	if (value == null) {
		return null;
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? truncateText(trimmed) : null;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (typeof value !== "object") {
		return null;
	}

	const candidate = value as Record<string, unknown>;
	const preferredFields = [
		"prompt",
		"query",
		"text",
		"message",
		"title",
		"name",
		"description",
		"url",
	];
	for (const field of preferredFields) {
		const fieldValue = candidate[field];
		if (typeof fieldValue === "string" && fieldValue.trim().length > 0) {
			return truncateText(fieldValue.trim());
		}
	}

	try {
		const serialized = JSON.stringify(value);
		if (serialized && serialized !== "{}") {
			return truncateText(serialized);
		}
	} catch {
		// Ignore serialization errors and return null.
	}
	return null;
}

function extractModelIdFromGeneration(generation: unknown): string | null {
	if (typeof generation !== "object" || generation === null) {
		return null;
	}

	const record = generation as Record<string, unknown>;
	const context =
		typeof record.context === "object" && record.context !== null
			? (record.context as Record<string, unknown>)
			: null;
	if (!context) {
		return null;
	}

	const operationNode =
		typeof context.operationNode === "object" && context.operationNode !== null
			? (context.operationNode as Record<string, unknown>)
			: null;
	if (!operationNode) {
		return null;
	}

	const content =
		typeof operationNode.content === "object" && operationNode.content !== null
			? (operationNode.content as Record<string, unknown>)
			: null;
	if (!content) {
		return null;
	}

	const type = content.type;
	if (type !== "textGeneration" && type !== "imageGeneration") {
		return null;
	}

	const llm =
		typeof content.llm === "object" && content.llm !== null
			? (content.llm as Record<string, unknown>)
			: null;
	if (!llm) {
		return null;
	}

	const modelId = llm.id;
	return typeof modelId === "string" && modelId.trim().length > 0
		? modelId
		: null;
}

async function getTaskInsights(task: Task): Promise<{
	inputSummary: string | null;
	llmModels: string[];
}> {
	const steps = task.sequences.flatMap((sequence) => sequence.steps);
	if (steps.length === 0) {
		return { inputSummary: null, llmModels: [] };
	}

	const generationById = new Map<string, unknown>();
	await Promise.all(
		steps.map(async (step) => {
			try {
				const generation = await giselle.getGeneration(step.generationId);
				generationById.set(step.generationId, generation);
			} catch {
				// Ignore missing generation data and keep extracting from remaining steps.
			}
		}),
	);

	const firstStep = task.sequences[0]?.steps?.[0];
	const firstGeneration = firstStep
		? generationById.get(firstStep.generationId)
		: undefined;

	let inputSummary: string | null = null;
	try {
		const generationRecord =
			typeof firstGeneration === "object" && firstGeneration !== null
				? (firstGeneration as Record<string, unknown>)
				: null;
		const context =
			generationRecord &&
			typeof generationRecord.context === "object" &&
			generationRecord.context !== null
				? (generationRecord.context as Record<string, unknown>)
				: null;
		const inputs = Array.isArray(context?.inputs)
			? (context.inputs as unknown[])
			: [];
		if (inputs.length > 0) {
			const preferredInput =
				inputs.find((input) => {
					if (typeof input !== "object" || input === null) {
						return false;
					}
					const inputRecord = input as Record<string, unknown>;
					return inputRecord.type === "parameters";
				}) ??
				inputs.find((input) => {
					if (typeof input !== "object" || input === null) {
						return false;
					}
					const inputRecord = input as Record<string, unknown>;
					return inputRecord.type === "github-webhook-event";
				}) ??
				inputs[0];
			inputSummary = summarizeUnknownInput(preferredInput);
		}
	} catch {
		inputSummary = null;
	}

	const llmModelSet = new Set<string>();
	for (const generation of generationById.values()) {
		const modelId = extractModelIdFromGeneration(generation);
		if (modelId) {
			llmModelSet.add(modelId);
		}
	}

	return {
		inputSummary,
		llmModels: Array.from(llmModelSet),
	};
}

const searchParamsCache = createSearchParamsCache({
	limit: parseAsInteger.withDefault(50),
	offset: parseAsInteger.withDefault(0),
});

type TaskListPageProps = {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function clampInt(value: number, { min, max }: { min: number; max: number }) {
	return Math.min(max, Math.max(min, value));
}

function getStatusBadge(taskStatus: Task["status"]) {
	if (taskStatus === "inProgress") {
		return (
			<StatusBadge status="info" variant="dot">
				Running
			</StatusBadge>
		);
	}
	if (taskStatus === "completed" || taskStatus === "created") {
		return (
			<StatusBadge status="success" variant="dot">
				Completed
			</StatusBadge>
		);
	}
	if (taskStatus === "failed") {
		return (
			<StatusBadge status="error" variant="dot">
				Failed
			</StatusBadge>
		);
	}
	return (
		<StatusBadge status="ignored" variant="dot">
			Cancelled
		</StatusBadge>
	);
}

function buildTasksHref({ limit, offset }: { limit: number; offset: number }) {
	const params = new URLSearchParams();
	params.set("limit", String(limit));
	params.set("offset", String(offset));
	return `?${params.toString()}`;
}

export default async function TaskListPage({
	searchParams,
}: TaskListPageProps) {
	const { limit: rawLimit, offset: rawOffset } =
		await searchParamsCache.parse(searchParams);

	const limit = clampInt(rawLimit, { min: 1, max: 100 });
	const offset = Math.max(0, rawOffset);

	const team = await fetchCurrentTeam();

	// Fetch one extra row to determine whether there's a next page.
	const dbTasks = await db.query.tasks.findMany({
		columns: { id: true, appDbId: true, createdAt: true },
		where: (tasks, { and, eq, isNotNull }) =>
			and(eq(tasks.teamDbId, team.dbId), isNotNull(tasks.appDbId)),
		orderBy: (tasks, { desc }) => [desc(tasks.createdAt)],
		limit: limit + 1,
		offset,
		with: {
			app: {
				columns: {
					workspaceDbId: true,
				},
				with: {
					workspace: {
						columns: {
							name: true,
						},
					},
				},
			},
		},
	});

	const hasNextPage = dbTasks.length > limit;
	const _dbTasks = hasNextPage ? dbTasks.slice(0, limit) : dbTasks;

	const tasks = await Promise.all(
		_dbTasks.map(async (dbTask) => {
			const task = await giselle.getTask({ taskId: dbTask.id });
			const { inputSummary, llmModels } = await getTaskInsights(task);
			if (dbTask.app === null) {
				return {
					id: task.id,
					startedAt: task.createdAt,
					status: task.status,
					inputSummary,
					llmModels,
					origin: {
						type: "github",
						repoName: "GitHub",
					},
				} satisfies UITaskListRow;
			}
			return {
				id: task.id,
				startedAt: task.createdAt,
				status: task.status,
				inputSummary,
				llmModels,
				origin: {
					type: "app",
					appName: dbTask.app.workspace.name ?? "Untitled",
				},
			} satisfies UITaskListRow;
		}),
	);

	const nextOffset = hasNextPage ? offset + limit : null;
	const prevOffset = offset - limit >= 0 ? offset - limit : null;

	return (
		<div className="px-[40px] py-[24px] flex-1 max-w-[1200px] mx-auto w-full">
			<div className="flex justify-between items-center mb-6">
				<div>
					<PageHeading glow>Tasks</PageHeading>
				</div>

				<div className="flex items-center gap-4">
					<DocsLink
						href="https://docs.recoder.xyz/en/guides/tasks"
						target="_blank"
						rel="noopener noreferrer"
					>
						About Tasks
					</DocsLink>
					<p className="text-sm text-text/60">Showing {tasks.length} task(s)</p>
					{prevOffset != null ? (
						<Link
							className="px-3 py-2 bg-white/10 text-inverse rounded-lg hover:bg-white/20 transition-colors text-sm"
							href={buildTasksHref({
								limit,
								offset: prevOffset,
							})}
						>
							Prev
						</Link>
					) : (
						<span className="px-3 py-2 bg-white/5 text-text/40 rounded-lg text-sm cursor-not-allowed">
							Prev
						</span>
					)}
					{nextOffset != null ? (
						<Link
							className="px-3 py-2 bg-white/10 text-inverse rounded-lg hover:bg-white/20 transition-colors text-sm"
							href={buildTasksHref({
								limit,
								offset: nextOffset,
							})}
						>
							Next
						</Link>
					) : (
						<span className="px-3 py-2 bg-white/5 text-text/40 rounded-lg text-sm cursor-not-allowed">
							Next
						</span>
					)}
				</div>
			</div>

			<div className="w-full">
				{tasks.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-16 text-center">
						<div className="mb-4 flex items-center justify-center">
							<div className="relative drop-shadow-[0_5px_5px_rgba(0,0,255,0.4)]">
								<ClipboardList
									className="relative z-10 h-9 w-9 text-[#B8E8F4]"
									strokeWidth={0.8}
								/>
								<div className="absolute inset-0 rounded-full bg-[#0087F6] opacity-30 blur-[10px]" />
							</div>
						</div>
						<h2 className="mb-2 text-lg font-medium text-link-muted">
							No tasks completed yet
						</h2>
						<p className="mb-6 max-w-sm text-sm text-link-muted">
							Get started by launching a workflow from Workflow Ops.
						</p>
						<Link
							href="/workflow-ops"
							className="px-4 py-2 bg-white/10 text-inverse rounded-lg hover:bg-white/20 transition-colors text-sm"
						>
							Get Started
						</Link>
					</div>
				) : (
					<Card className="!flex !flex-col gap-0 py-2 px-0">
						{/* Header */}
						<div className="grid grid-cols-[1fr_120px] md:grid-cols-[2fr_120px_1.5fr_1fr_1fr] items-center gap-4 px-[24px] py-2 border-b-[0.5px] border-border-muted">
							<p className="text-[12px] font-geist font-semibold text-text/60">
								Task
							</p>
							<p className="text-[12px] font-geist font-semibold text-text/60">
								Status
							</p>
							<p className="hidden md:block text-[12px] font-geist font-semibold text-text/60">
								Input
							</p>
							<p className="hidden md:block text-[12px] font-geist font-semibold text-text/60">
								Model
							</p>
							<p className="hidden md:block text-[12px] font-geist font-semibold text-text/60">
								Origin
							</p>
						</div>

						{tasks.map((task) => {
							const originLabel =
								task.origin.type === "app"
									? task.origin.appName
									: task.origin.repoName;
							const inputLabel = task.inputSummary ?? "—";
							const modelLabel =
								task.llmModels.length === 0
									? "—"
									: task.llmModels.length <= 2
										? task.llmModels.join(", ")
										: `${task.llmModels.slice(0, 2).join(", ")} +${task.llmModels.length - 2}`;

							return (
								<div
									key={task.id}
									className="grid grid-cols-[1fr_120px] md:grid-cols-[2fr_120px_1.5fr_1fr_1fr] items-center gap-4 px-[24px] py-3 border-t-[0.5px] border-border-muted first:border-t-0 hover:bg-white/5 transition-colors duration-200"
								>
									<div className="flex flex-col min-w-0">
										<Link
											href={`/tasks/${task.id}`}
											className="truncate text-[14px] font-medium text-white-100 hover:underline"
										>
											{task.id}
										</Link>
										<span className="text-[13px] text-text/60 truncate">
											<LocalDateTime date={new Date(task.startedAt)} />
											<span className="md:hidden"> · {originLabel}</span>
										</span>
									</div>

									<div className="flex items-center justify-start">
										{getStatusBadge(task.status)}
									</div>

									<div className="hidden md:flex min-w-0">
										<span className="text-sm text-white-700 truncate">
											{inputLabel}
										</span>
									</div>

									<div className="hidden md:flex min-w-0">
										<span className="text-sm text-white-700 truncate">
											{modelLabel}
										</span>
									</div>

									<div className="hidden md:flex min-w-0">
										<span className="text-sm text-white-700 truncate">
											{originLabel}
										</span>
									</div>
								</div>
							);
						})}
					</Card>
				)}
			</div>
		</div>
	);
}
