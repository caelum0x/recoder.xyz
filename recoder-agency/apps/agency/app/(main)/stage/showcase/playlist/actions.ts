"use server";

import { eq, and, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	db,
	showcasePlaylists,
	showcasePlaylistApps,
	flowTriggers,
	agents,
} from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import { fetchCurrentTeam } from "@/services/teams/fetch-current-team";

function generatePlaylistId(): string {
	return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function createPlaylist(formData: {
	title: string;
	description: string;
}) {
	const user = await getCurrentUser();
	const team = await fetchCurrentTeam();

	if (!formData.title.trim()) {
		return { error: "Playlist title is required" };
	}

	const [playlist] = await db
		.insert(showcasePlaylists)
		.values({
			id: generatePlaylistId(),
			teamDbId: team.dbId,
			creatorUserDbId: user.dbId,
			title: formData.title.trim(),
			description: formData.description.trim(),
		})
		.returning({ id: showcasePlaylists.id, dbId: showcasePlaylists.dbId });

	revalidatePath("/stage/showcase");
	return { id: playlist.id };
}

export async function updatePlaylist(
	playlistId: string,
	formData: { title: string; description: string },
) {
	const team = await fetchCurrentTeam();

	if (!formData.title.trim()) {
		return { error: "Playlist title is required" };
	}

	await db
		.update(showcasePlaylists)
		.set({
			title: formData.title.trim(),
			description: formData.description.trim(),
		})
		.where(
			and(
				eq(showcasePlaylists.id, playlistId),
				eq(showcasePlaylists.teamDbId, team.dbId),
			),
		);

	revalidatePath("/stage/showcase");
	revalidatePath(`/stage/showcase/playlist/${playlistId}`);
	return { success: true };
}

export async function deletePlaylist(playlistId: string) {
	const team = await fetchCurrentTeam();

	await db
		.delete(showcasePlaylists)
		.where(
			and(
				eq(showcasePlaylists.id, playlistId),
				eq(showcasePlaylists.teamDbId, team.dbId),
			),
		);

	revalidatePath("/stage/showcase");
	return { success: true };
}

export async function addAppsToPlaylist(
	playlistId: string,
	triggerIds: string[],
) {
	const team = await fetchCurrentTeam();

	// Get the playlist dbId
	const [playlist] = await db
		.select({ dbId: showcasePlaylists.dbId })
		.from(showcasePlaylists)
		.where(
			and(
				eq(showcasePlaylists.id, playlistId),
				eq(showcasePlaylists.teamDbId, team.dbId),
			),
		)
		.limit(1);

	if (!playlist) {
		return { error: "Playlist not found" };
	}

	// Get flow trigger dbIds
	const triggers = await db
		.select({
			dbId: flowTriggers.dbId,
			triggerId: flowTriggers.sdkFlowTriggerId,
		})
		.from(flowTriggers)
		.where(eq(flowTriggers.teamDbId, team.dbId));

	const triggerMap = new Map(
		triggers.map((t) => [t.triggerId, t.dbId]),
	);

	// Get current max sort order
	const existing = await db
		.select({ sortOrder: showcasePlaylistApps.sortOrder })
		.from(showcasePlaylistApps)
		.where(eq(showcasePlaylistApps.playlistDbId, playlist.dbId))
		.orderBy(asc(showcasePlaylistApps.sortOrder));

	let nextOrder = existing.length > 0
		? (existing[existing.length - 1].sortOrder + 1)
		: 0;

	const toInsert = triggerIds
		.map((tid) => triggerMap.get(tid))
		.filter((dbId): dbId is number => dbId !== undefined)
		.map((flowTriggerDbId) => ({
			playlistDbId: playlist.dbId,
			flowTriggerDbId,
			sortOrder: nextOrder++,
		}));

	if (toInsert.length > 0) {
		// Use onConflictDoNothing to skip duplicates
		await db
			.insert(showcasePlaylistApps)
			.values(toInsert)
			.onConflictDoNothing();
	}

	revalidatePath(`/stage/showcase/playlist/${playlistId}`);
	return { success: true, added: toInsert.length };
}

export async function removeAppFromPlaylist(
	playlistId: string,
	flowTriggerDbId: number,
) {
	const team = await fetchCurrentTeam();

	const [playlist] = await db
		.select({ dbId: showcasePlaylists.dbId })
		.from(showcasePlaylists)
		.where(
			and(
				eq(showcasePlaylists.id, playlistId),
				eq(showcasePlaylists.teamDbId, team.dbId),
			),
		)
		.limit(1);

	if (!playlist) {
		return { error: "Playlist not found" };
	}

	await db
		.delete(showcasePlaylistApps)
		.where(
			and(
				eq(showcasePlaylistApps.playlistDbId, playlist.dbId),
				eq(showcasePlaylistApps.flowTriggerDbId, flowTriggerDbId),
			),
		);

	revalidatePath(`/stage/showcase/playlist/${playlistId}`);
	return { success: true };
}

export async function getTeamPlaylists() {
	const team = await fetchCurrentTeam();

	const rows = await db
		.select({
			id: showcasePlaylists.id,
			title: showcasePlaylists.title,
			description: showcasePlaylists.description,
			createdAt: showcasePlaylists.createdAt,
			updatedAt: showcasePlaylists.updatedAt,
		})
		.from(showcasePlaylists)
		.where(eq(showcasePlaylists.teamDbId, team.dbId))
		.orderBy(asc(showcasePlaylists.createdAt));

	// Count apps per playlist
	const playlistDbIds = await db
		.select({
			dbId: showcasePlaylists.dbId,
			id: showcasePlaylists.id,
		})
		.from(showcasePlaylists)
		.where(eq(showcasePlaylists.teamDbId, team.dbId));

	const appCounts = new Map<string, number>();
	for (const p of playlistDbIds) {
		const [count] = await db
			.select({ count: showcasePlaylistApps.dbId })
			.from(showcasePlaylistApps)
			.where(eq(showcasePlaylistApps.playlistDbId, p.dbId));
		appCounts.set(p.id, count ? 1 : 0);
	}

	// Get actual counts
	const result = await Promise.all(
		rows.map(async (row) => {
			const pRow = playlistDbIds.find((p) => p.id === row.id);
			if (!pRow) return { ...row, appsCount: 0 };

			const apps = await db
				.select({ dbId: showcasePlaylistApps.dbId })
				.from(showcasePlaylistApps)
				.where(eq(showcasePlaylistApps.playlistDbId, pRow.dbId));

			return { ...row, appsCount: apps.length };
		}),
	);

	return result;
}

export async function getPlaylistById(playlistId: string) {
	const team = await fetchCurrentTeam();

	const [playlist] = await db
		.select({
			dbId: showcasePlaylists.dbId,
			id: showcasePlaylists.id,
			title: showcasePlaylists.title,
			description: showcasePlaylists.description,
			createdAt: showcasePlaylists.createdAt,
			updatedAt: showcasePlaylists.updatedAt,
		})
		.from(showcasePlaylists)
		.where(
			and(
				eq(showcasePlaylists.id, playlistId),
				eq(showcasePlaylists.teamDbId, team.dbId),
			),
		)
		.limit(1);

	if (!playlist) return null;

	// Fetch linked apps
	const linkedApps = await db
		.select({
			flowTriggerDbId: showcasePlaylistApps.flowTriggerDbId,
			sortOrder: showcasePlaylistApps.sortOrder,
			triggerId: flowTriggers.sdkFlowTriggerId,
			workspaceId: flowTriggers.sdkWorkspaceId,
		})
		.from(showcasePlaylistApps)
		.innerJoin(
			flowTriggers,
			eq(showcasePlaylistApps.flowTriggerDbId, flowTriggers.dbId),
		)
		.where(eq(showcasePlaylistApps.playlistDbId, playlist.dbId))
		.orderBy(asc(showcasePlaylistApps.sortOrder));

	// Get agent names for each workspace
	const apps = await Promise.all(
		linkedApps.map(async (la) => {
			const [agent] = await db
				.select({
					name: agents.name,
					updatedAt: agents.updatedAt,
				})
				.from(agents)
				.where(eq(agents.workspaceId, la.workspaceId))
				.limit(1);

			return {
				id: la.triggerId,
				name: agent?.name ?? "Untitled",
				workspaceId: la.workspaceId,
				updatedAt: agent?.updatedAt ?? new Date(),
			};
		}),
	);

	return {
		id: playlist.id,
		title: playlist.title,
		description: playlist.description,
		createdAt: playlist.createdAt,
		updatedAt: playlist.updatedAt,
		apps,
	};
}
