import { eq } from "drizzle-orm";
import { db, projects, quotes } from "@/db";
import { notifyClient } from "@/lib/agency/channel-notifier";

/**
 * Called when a client approves a quote.
 * Updates project status and triggers a build via recoder-web.
 */
export async function triggerBuildFromQuote(params: {
	projectDbId: number;
	projectId: string;
	clientDbId: number;
}): Promise<{ taskId: string | null }> {
	const recoderWebUrl = process.env.RECODER_WEB_URL?.trim();
	const recoderWebApiKey = process.env.RECODER_WEB_API_KEY?.trim();

	// Update quote status
	const quote = await db.query.quotes.findFirst({
		where: eq(quotes.projectDbId, params.projectDbId),
	});

	if (quote) {
		await db
			.update(quotes)
			.set({ status: "accepted", acceptedAt: new Date() })
			.where(eq(quotes.dbId, quote.dbId));
	}

	// Notify client
	await notifyClient(
		params.clientDbId,
		`Quote approved! Building your project now. You'll get updates as we make progress.`,
	);

	// Trigger recoder-web build if configured
	if (!recoderWebUrl || !recoderWebApiKey) {
		console.warn(
			"RECODER_WEB_URL or RECODER_WEB_API_KEY not set, skipping build trigger.",
		);
		return { taskId: null };
	}

	try {
		const project = await db.query.projects.findFirst({
			where: eq(projects.dbId, params.projectDbId),
		});

		if (!project?.brief) {
			return { taskId: null };
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 30_000);
		let response: Response;
		try {
			response = await fetch(`${recoderWebUrl}/api/public/projects/prompt`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${recoderWebApiKey}`,
				},
				body: JSON.stringify({
					prompt: project.brief,
					projectName: project.name,
				}),
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timeout);
		}

		if (!response.ok) {
			console.error(`Build trigger failed: HTTP ${response.status}`);
			return { taskId: null };
		}

		const result = (await response.json()) as {
			taskId?: string;
		};

		// Store build task ID in scope override reason for reference
		if (result.taskId) {
			const existingReason = project.scopeOverrideReason ?? "";
			const buildRef = `[build] taskId=${result.taskId}`;
			await db
				.update(projects)
				.set({
					scopeOverrideReason: existingReason
						? `${existingReason}\n${buildRef}`
						: buildRef,
				})
				.where(eq(projects.dbId, params.projectDbId));
		}

		return { taskId: result.taskId ?? null };
	} catch (error) {
		console.error("Build trigger error:", error);
		return { taskId: null };
	}
}
