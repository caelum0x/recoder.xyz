"use client";

export interface ShowcaseApp {
	id: string;
	name: string;
	workspaceId: string;
	updatedAt: Date;
}

export interface ShowcasePlaylist {
	id: string;
	title: string;
	description: string;
	createdAt: Date;
	updatedAt: Date;
	apps: ShowcaseApp[];
}

export const SHOWCASE_PLAYLISTS_STORAGE_KEY = "showcase.playlists.v1";
export const SHOWCASE_FAVORITES_STORAGE_KEY = "showcase.app-favorites.v1";

export const fallbackPlaylists: ShowcasePlaylist[] = [
	{
		id: "1",
		title: "AI Writing Assistants",
		description:
			"A collection of AI agents focused on content creation and writing tasks",
		createdAt: new Date("2024-01-15"),
		updatedAt: new Date("2024-01-20"),
		apps: [
			{
				id: "app-1",
				name: "Blog Writer Pro",
				workspaceId: "workspace-1",
				updatedAt: new Date("2024-01-18"),
			},
			{
				id: "app-2",
				name: "Email Assistant",
				workspaceId: "workspace-2",
				updatedAt: new Date("2024-01-19"),
			},
			{
				id: "app-3",
				name: "Technical Documentation",
				workspaceId: "workspace-3",
				updatedAt: new Date("2024-01-20"),
			},
		],
	},
	{
		id: "2",
		title: "Data Analysis Tools",
		description: "Smart agents for data processing and insights generation",
		createdAt: new Date("2024-01-10"),
		updatedAt: new Date("2024-01-25"),
		apps: [
			{
				id: "app-4",
				name: "CSV Analyzer",
				workspaceId: "workspace-4",
				updatedAt: new Date("2024-01-22"),
			},
			{
				id: "app-5",
				name: "Report Generator",
				workspaceId: "workspace-5",
				updatedAt: new Date("2024-01-25"),
			},
		],
	},
];

const toSerializablePlaylist = (playlist: ShowcasePlaylist) => ({
	...playlist,
	createdAt: playlist.createdAt.toISOString(),
	updatedAt: playlist.updatedAt.toISOString(),
	apps: playlist.apps.map((app) => ({
		...app,
		updatedAt: app.updatedAt.toISOString(),
	})),
});

const fromSerializablePlaylist = (playlist: any): ShowcasePlaylist => ({
	...playlist,
	createdAt: new Date(playlist.createdAt),
	updatedAt: new Date(playlist.updatedAt),
	apps: (playlist.apps ?? []).map((app: any) => ({
		...app,
		updatedAt: new Date(app.updatedAt),
	})),
});

export function loadPlaylists(): ShowcasePlaylist[] {
	if (typeof window === "undefined") {
		return fallbackPlaylists;
	}
	const raw = window.localStorage.getItem(SHOWCASE_PLAYLISTS_STORAGE_KEY);
	if (!raw) {
		return fallbackPlaylists;
	}

	try {
		const parsed = JSON.parse(raw) as any[];
		return parsed.map(fromSerializablePlaylist);
	} catch {
		return fallbackPlaylists;
	}
}

export function savePlaylists(playlists: ShowcasePlaylist[]): void {
	if (typeof window === "undefined") {
		return;
	}
	window.localStorage.setItem(
		SHOWCASE_PLAYLISTS_STORAGE_KEY,
		JSON.stringify(playlists.map(toSerializablePlaylist)),
	);
}

export function loadFavoriteAppIds(): Set<string> {
	if (typeof window === "undefined") {
		return new Set();
	}
	const raw = window.localStorage.getItem(SHOWCASE_FAVORITES_STORAGE_KEY);
	if (!raw) {
		return new Set();
	}
	try {
		return new Set(JSON.parse(raw) as string[]);
	} catch {
		return new Set();
	}
}

export function saveFavoriteAppIds(ids: Set<string>): void {
	if (typeof window === "undefined") {
		return;
	}
	window.localStorage.setItem(
		SHOWCASE_FAVORITES_STORAGE_KEY,
		JSON.stringify([...ids]),
	);
}

