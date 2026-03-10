import { notFound } from "next/navigation";
import { stageV2Flag } from "@/flags";
import { getPlaylistById } from "../actions";
import { PlaylistDetailClient } from "./playlist-detail-client";

interface PlaylistDetailPageProps {
	params: Promise<{
		id: string;
	}>;
}

export default async function PlaylistDetailPage({
	params,
}: PlaylistDetailPageProps) {
	const enableStageV2 = await stageV2Flag();
	if (!enableStageV2) {
		notFound();
	}

	const { id } = await params;
	const playlist = await getPlaylistById(id);

	if (!playlist) {
		notFound();
	}

	return <PlaylistDetailClient playlist={playlist} />;
}
