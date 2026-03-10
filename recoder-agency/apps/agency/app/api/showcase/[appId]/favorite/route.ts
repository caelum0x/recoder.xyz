import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db, showcaseFavorites } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { fetchCurrentTeam } from "@/services/teams/fetch-current-team";

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ appId: string }> },
) {
	try {
		const { appId } = await params;
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
					eq(showcaseFavorites.itemId, appId),
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
						eq(showcaseFavorites.itemId, appId),
					),
				);
			return NextResponse.json({
				success: true,
				appId,
				isFavorite: false,
			});
		}

		// Add favorite
		await db.insert(showcaseFavorites).values({
			userDbId: user.dbId,
			teamDbId: team.dbId,
			itemId: appId,
		});

		return NextResponse.json({ success: true, appId, isFavorite: true });
	} catch (error) {
		console.error("Error toggling favorite:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to toggle favorite" },
			{ status: 500 },
		);
	}
}
