"use server";

import { and, eq } from "drizzle-orm";
import { db, showcaseFavorites } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { fetchCurrentTeam } from "@/services/teams/fetch-current-team";

/**
 * Get all favorited item IDs for the current user + team.
 */
export async function getFavorites(): Promise<string[]> {
	const user = await getCurrentUser();
	const team = await fetchCurrentTeam();

	const rows = await db
		.select({ itemId: showcaseFavorites.itemId })
		.from(showcaseFavorites)
		.where(
			and(
				eq(showcaseFavorites.userDbId, user.dbId),
				eq(showcaseFavorites.teamDbId, team.dbId),
			),
		);

	return rows.map((r) => r.itemId);
}

/**
 * Toggle a favorite for the current user + team.
 * Returns the new favorite state (true = now favorited, false = removed).
 */
export async function toggleFavorite(itemId: string): Promise<boolean> {
	const user = await getCurrentUser();
	const team = await fetchCurrentTeam();

	// Check if already favorited
	const existing = await db
		.select({ dbId: showcaseFavorites.dbId })
		.from(showcaseFavorites)
		.where(
			and(
				eq(showcaseFavorites.userDbId, user.dbId),
				eq(showcaseFavorites.teamDbId, team.dbId),
				eq(showcaseFavorites.itemId, itemId),
			),
		)
		.limit(1);

	if (existing.length > 0) {
		// Remove favorite
		await db
			.delete(showcaseFavorites)
			.where(
				and(
					eq(showcaseFavorites.userDbId, user.dbId),
					eq(showcaseFavorites.teamDbId, team.dbId),
					eq(showcaseFavorites.itemId, itemId),
				),
			);
		return false;
	}

	// Add favorite
	await db.insert(showcaseFavorites).values({
		userDbId: user.dbId,
		teamDbId: team.dbId,
		itemId,
	});
	return true;
}
