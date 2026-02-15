import crypto, { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, deliverables, projects } from "@/db";
import { notifyClient } from "@/lib/agency/channel-notifier";
import {
	evaluateDeliverableQaGate,
	recordDeliverableQaGateRun,
} from "@/lib/agency/deliverable-qa-gate";
import { applyProjectTransitionWithAudit } from "@/lib/agency/project-transition";

/**
 * Webhook callback from recoder-web when a build completes or fails.
 * POST /api/webhooks/recoder-web
 */
export async function POST(request: Request) {
	const apiKey = process.env.RECODER_WEB_API_KEY?.trim();
	const provided = request.headers.get("x-api-key");
	const apiKeyBuf = apiKey ? Buffer.from(apiKey) : null;
	const providedBuf = provided ? Buffer.from(provided) : null;
	if (
		!apiKeyBuf ||
		!providedBuf ||
		apiKeyBuf.length !== providedBuf.length ||
		!timingSafeEqual(apiKeyBuf, providedBuf)
	) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const WebhookBodySchema = z.object({
		event: z.string(),
		projectId: z.string().optional(),
		taskId: z.string().optional(),
		previewUrl: z.string().optional(),
		error: z.string().optional(),
	});

	const parsed = WebhookBodySchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request body", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}
	const body = parsed.data;

	if (!body.projectId) {
		return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
	}

	const project = await db.query.projects.findFirst({
		where: eq(projects.id, body.projectId),
	});

	if (!project) {
		return NextResponse.json({ error: "Project not found" }, { status: 404 });
	}

	if (body.event === "build.completed" && body.previewUrl) {
		// Create deliverable with preview URL
		const deliverableId = `del_${crypto.randomUUID()}`;
		const deliverableName = `Build ${new Date().toISOString().slice(0, 10)}`;
		const [inserted] = await db
			.insert(deliverables)
			.values({
				id: deliverableId,
				projectDbId: project.dbId,
				name: deliverableName,
				type: "code",
				status: "draft",
				content: body.previewUrl,
			})
			.returning({ dbId: deliverables.dbId });

		// Run automated QA gate before sending to client
		const qaResult = await evaluateDeliverableQaGate({
			teamDbId: project.teamDbId,
			deliverableType: "code",
			deliverableName,
			content: body.previewUrl,
			fileKey: null,
		});

		await recordDeliverableQaGateRun({
			teamDbId: project.teamDbId,
			projectDbId: project.dbId,
			deliverableDbId: inserted.dbId,
			actorUserDbId: null,
			result: qaResult,
			forcedOverride: false,
		});

		if (!qaResult.passed) {
			// QA failed — keep deliverable as draft, do not transition
			console.warn(
				`QA gate failed for deliverable ${deliverableId}:`,
				qaResult.failures,
			);
			return NextResponse.json({
				ok: true,
				action: "qa_gate_failed",
				deliverableId,
				failures: qaResult.failures,
			});
		}

		// QA passed — promote to pending_review
		await db
			.update(deliverables)
			.set({ status: "pending_review" })
			.where(eq(deliverables.dbId, inserted.dbId));

		// Transition project to client_review
		await db.transaction(async (tx) => {
			await applyProjectTransitionWithAudit(tx, {
				projectDbId: project.dbId,
				fromStatus: project.status,
				toStatus: "client_review",
				actorUserDbId: null,
				reason: "Build completed, QA passed — ready for review",
				source: "webhook.recoder-web",
			});
		});

		// Notify client
		await notifyClient(
			project.clientDbId,
			[
				`Your project "${project.name}" is ready for review!`,
				"",
				`Preview: ${body.previewUrl}`,
				"",
				`Reply "approve deliverable:${deliverableId}" to approve, or share your feedback.`,
			].join("\n"),
		);

		return NextResponse.json({
			ok: true,
			action: "deliverable_created",
			deliverableId,
		});
	}

	if (body.event === "build.failed") {
		await notifyClient(
			project.clientDbId,
			`Build for "${project.name}" encountered an issue. Our team is looking into it.`,
		);

		return NextResponse.json({ ok: true, action: "build_failed_notified" });
	}

	return NextResponse.json({ ok: true, action: "ignored" });
}
