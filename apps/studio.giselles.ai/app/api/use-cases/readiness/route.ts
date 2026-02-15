import { NextResponse } from "next/server";
import {
	type AiStudioUseCaseId,
	RECODER_AI_STUDIO_USE_CASES,
} from "@recoder/ecosystem-config";
import {
	evaluateUseCaseReadinessForTeam,
	isKnownUseCaseId,
} from "@/lib/use-cases/evaluate-readiness";
import { fetchCurrentTeam } from "@/services/teams";

export async function GET(request: Request) {
	const useCaseIdQuery = new URL(request.url).searchParams.get("useCaseId");
	if (useCaseIdQuery && !isKnownUseCaseId(useCaseIdQuery)) {
		return NextResponse.json({ error: "Unknown useCaseId." }, { status: 404 });
	}

	const team = await fetchCurrentTeam();
	const readinessByUseCase = await evaluateUseCaseReadinessForTeam(team.dbId);

	if (useCaseIdQuery) {
		const useCaseId = useCaseIdQuery as AiStudioUseCaseId;
		return NextResponse.json({ readiness: readinessByUseCase[useCaseId] });
	}

	return NextResponse.json({
		readiness: RECODER_AI_STUDIO_USE_CASES.map(
			(item) => readinessByUseCase[item.id],
		),
	});
}
