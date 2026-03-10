"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { apps, featuredItems, workspaces } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/get-current-user";

export async function getRecentApps(teamDbId: number, limit = 6) {
	return db
		.select({
			id: apps.id,
			createdAt: apps.createdAt,
			updatedAt: apps.updatedAt,
			workspaceDbId: apps.workspaceDbId,
		})
		.from(apps)
		.where(eq(apps.teamDbId, teamDbId))
		.orderBy(desc(apps.updatedAt))
		.limit(limit);
}

export async function getRecentWorkflows(teamDbId: number, limit = 6) {
	return db
		.select({
			id: workspaces.id,
			name: workspaces.name,
			updatedAt: workspaces.updatedAt,
		})
		.from(workspaces)
		.where(eq(workspaces.teamDbId, teamDbId))
		.orderBy(desc(workspaces.updatedAt))
		.limit(limit);
}

export async function getFeaturedApps(teamDbId: number) {
	const featured = await db
		.select({ itemId: featuredItems.itemId })
		.from(featuredItems)
		.where(
			and(
				eq(featuredItems.teamDbId, teamDbId),
				eq(featuredItems.itemType, "app"),
			),
		);

	if (featured.length === 0) return [];

	const ids = featured.map((f) => f.itemId);
	return db
		.select({
			id: apps.id,
			createdAt: apps.createdAt,
			updatedAt: apps.updatedAt,
			workspaceDbId: apps.workspaceDbId,
		})
		.from(apps)
		.where(and(eq(apps.teamDbId, teamDbId), inArray(apps.id, ids)));
}

export async function getFeaturedWorkflows(teamDbId: number) {
	const featured = await db
		.select({ itemId: featuredItems.itemId })
		.from(featuredItems)
		.where(
			and(
				eq(featuredItems.teamDbId, teamDbId),
				eq(featuredItems.itemType, "workflow"),
			),
		);

	if (featured.length === 0) return [];

	const ids = featured.map((f) => f.itemId);
	return db
		.select({
			id: workspaces.id,
			name: workspaces.name,
			updatedAt: workspaces.updatedAt,
		})
		.from(workspaces)
		.where(
			and(eq(workspaces.teamDbId, teamDbId), inArray(workspaces.id, ids)),
		);
}

export async function getFeaturedItemIds(teamDbId: number) {
	const rows = await db
		.select({
			itemType: featuredItems.itemType,
			itemId: featuredItems.itemId,
		})
		.from(featuredItems)
		.where(eq(featuredItems.teamDbId, teamDbId));

	return new Map(rows.map((r) => [`${r.itemType}:${r.itemId}`, true]));
}

export async function toggleFeaturedItem(
	teamDbId: number,
	itemType: "app" | "workflow",
	itemId: string,
) {
	const user = await getCurrentUser();

	const existing = await db
		.select({ dbId: featuredItems.dbId })
		.from(featuredItems)
		.where(
			and(
				eq(featuredItems.teamDbId, teamDbId),
				eq(featuredItems.itemType, itemType),
				eq(featuredItems.itemId, itemId),
			),
		)
		.limit(1);

	if (existing.length > 0) {
		await db
			.delete(featuredItems)
			.where(eq(featuredItems.dbId, existing[0].dbId));
	} else {
		await db.insert(featuredItems).values({
			teamDbId,
			itemType,
			itemId,
			featuredByUserDbId: user.dbId,
		});
	}

	revalidatePath("/lobby");
}
