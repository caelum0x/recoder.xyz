"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlaylistDetailClient } from "./playlist-detail-client";
import { fallbackPlaylists, loadPlaylists, type ShowcasePlaylist } from "../../playlist-data";

interface PlaylistDetailLoaderProps {
	playlistId: string;
}

export function PlaylistDetailLoader({ playlistId }: PlaylistDetailLoaderProps) {
	const [playlist, setPlaylist] = useState<ShowcasePlaylist | null>(null);

	useEffect(() => {
		const playlists = loadPlaylists();
		const found = playlists.find((item) => item.id === playlistId) ?? null;
		if (found) {
			setPlaylist(found);
			return;
		}
		const fallback = fallbackPlaylists.find((item) => item.id === playlistId) ?? null;
		setPlaylist(fallback);
	}, [playlistId]);

	if (!playlist) {
		return (
			<div className="flex min-h-[40vh] items-center justify-center px-6">
				<div className="text-center">
					<h2 className="text-lg font-semibold text-text">Playlist not found</h2>
					<p className="mt-2 text-sm text-text-muted">
						The requested playlist may have been deleted.
					</p>
					<Link
						className="mt-4 inline-flex rounded-md border border-border px-3 py-2 text-sm text-text"
						href="/stage/showcase?tab=Playlist"
					>
						Back to Playlist
					</Link>
				</div>
			</div>
		);
	}

	return <PlaylistDetailClient playlist={playlist} />;
}

