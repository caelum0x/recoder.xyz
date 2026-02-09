"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, serviceCatalog } from "@/db";
import { requireAdminRole } from "@/services/teams";

export async function createService(formData: FormData) {
	const team = await requireAdminRole();
	const name = (formData.get("name") as string)?.trim();
	const description = (formData.get("description") as string)?.trim() || null;
	const priceStr = formData.get("price") as string;
	const estimatedDaysStr = formData.get("estimatedDays") as string;
	const deliverableType =
		(formData.get("deliverableType") as string)?.trim() || null;

	if (!name) {
		throw new Error("Name is required");
	}

	const priceCents = Math.round(Number.parseFloat(priceStr) * 100);
	if (Number.isNaN(priceCents) || priceCents < 0) {
		throw new Error("Invalid price");
	}

	const estimatedDays = estimatedDaysStr
		? Number.parseInt(estimatedDaysStr, 10)
		: null;

	await db.insert(serviceCatalog).values({
		id: crypto.randomUUID(),
		teamDbId: team.dbId,
		name,
		description,
		priceCents,
		estimatedDays,
		deliverableType: deliverableType as
			| "document"
			| "code"
			| "design"
			| "other"
			| null,
		status: "active",
	});

	revalidatePath("/services");
}

export async function updateService(serviceId: string, formData: FormData) {
	const team = await requireAdminRole();
	const name = (formData.get("name") as string)?.trim();
	const description = (formData.get("description") as string)?.trim() || null;
	const priceStr = formData.get("price") as string;
	const estimatedDaysStr = formData.get("estimatedDays") as string;
	const deliverableType =
		(formData.get("deliverableType") as string)?.trim() || null;

	if (!name) {
		throw new Error("Name is required");
	}

	const priceCents = Math.round(Number.parseFloat(priceStr) * 100);
	if (Number.isNaN(priceCents) || priceCents < 0) {
		throw new Error("Invalid price");
	}

	const estimatedDays = estimatedDaysStr
		? Number.parseInt(estimatedDaysStr, 10)
		: null;

	await db
		.update(serviceCatalog)
		.set({
			name,
			description,
			priceCents,
			estimatedDays,
			deliverableType: deliverableType as
				| "document"
				| "code"
				| "design"
				| "other"
				| null,
		})
		.where(
			and(
				eq(serviceCatalog.id, serviceId),
				eq(serviceCatalog.teamDbId, team.dbId),
			),
		);

	revalidatePath("/services");
}

export async function archiveService(serviceId: string) {
	const team = await requireAdminRole();

	await db
		.update(serviceCatalog)
		.set({ status: "archived" })
		.where(
			and(
				eq(serviceCatalog.id, serviceId),
				eq(serviceCatalog.teamDbId, team.dbId),
			),
		);

	revalidatePath("/services");
}

export async function restoreService(serviceId: string) {
	const team = await requireAdminRole();

	await db
		.update(serviceCatalog)
		.set({ status: "active" })
		.where(
			and(
				eq(serviceCatalog.id, serviceId),
				eq(serviceCatalog.teamDbId, team.dbId),
			),
		);

	revalidatePath("/services");
}
