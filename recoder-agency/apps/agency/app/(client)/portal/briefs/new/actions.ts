"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { clients, db, projects } from "@/db";
import { getClientForUser } from "@/lib/agency/get-client-for-user";
import { getCurrentUser } from "@/lib/get-current-user";

export async function submitBrief(formData: FormData) {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);

	if (!client) {
		throw new Error("No client profile found");
	}

	const serviceType = formData.get("serviceType") as string;
	const description = formData.get("description") as string;
	const timeline = formData.get("timeline") as string;

	if (!description?.trim()) {
		throw new Error("Description is required");
	}

	const briefText = [
		serviceType ? `Service: ${serviceType}` : null,
		description.trim(),
		timeline ? `Timeline: ${timeline}` : null,
	]
		.filter(Boolean)
		.join("\n\n");

	const projectName = serviceType
		? `${serviceType.replace("_", " ")} - ${client.name}`
		: `New Brief - ${client.name}`;

	const id = crypto.randomUUID();

	const [inserted] = await db
		.insert(projects)
		.values({
			id,
			teamDbId: client.teamDbId,
			clientDbId: client.dbId,
			name: projectName,
			brief: briefText,
			status: "draft",
		})
		.returning({ dbId: projects.dbId });

	// Async AI brief analysis (fire and forget — enhances the brief in background)
	import("@/lib/agency/workflows/brief-analyzer").then(async ({ analyzeBrief }) => {
		try {
			const { createOpenRouterModel } = await import(
				"@/lib/agency/openrouter-model"
			);
			const model = createOpenRouterModel("openai/gpt-4o-mini");
			if (model) {
				await analyzeBrief({
					projectDbId: inserted.dbId,
					projectId: id,
					brief: briefText,
					clientName: client.name,
					model,
				});
			}
		} catch {}
	});

	redirect(`/portal/briefs/confirmation?briefId=${id}`);
}
