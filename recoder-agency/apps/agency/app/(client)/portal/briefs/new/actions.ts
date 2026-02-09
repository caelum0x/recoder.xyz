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

	await db.insert(projects).values({
		id,
		teamDbId: client.teamDbId,
		clientDbId: client.dbId,
		name: projectName,
		brief: briefText,
		status: "draft",
	});

	redirect("/portal/projects");
}
