import { notFound } from "next/navigation";
import { stageV2Flag } from "@/flags";
import { PlaylistDetailLoader } from "./playlist-detail-loader";

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
	return <PlaylistDetailLoader playlistId={id} />;
}
