import { NextResponse } from "next/server";
import {
	type AiStudioUseCaseId,
	RECODER_AI_STUDIO_USE_CASES,
} from "@recoder/ecosystem-config";
import { z } from "zod";
import { isKnownUseCaseId } from "@/lib/use-cases/evaluate-readiness";
import { simulateUseCaseForTeam } from "@/lib/use-cases/simulation";
import { fetchCurrentTeam } from "@/services/teams";

const simulateUseCaseSchema = z.object({
	useCaseId: z.string().min(1),
});

export async function GET(request: Request) {
	const useCaseIdQuery = new URL(request.url).searchParams.get("useCaseId");
	if (useCaseIdQuery && !isKnownUseCaseId(useCaseIdQuery)) {
		return NextResponse.json({ error: "Unknown useCaseId." }, { status: 404 });
	}

	const team = await fetchCurrentTeam();

	if (useCaseIdQuery) {
		const report = await simulateUseCaseForTeam({
			teamDbId: team.dbId,
			useCaseId: useCaseIdQuery as AiStudioUseCaseId,
		});
		return NextResponse.json({ report });
	}

	const reports = await Promise.all(
		RECODER_AI_STUDIO_USE_CASES.map((useCase) =>
			simulateUseCaseForTeam({
				teamDbId: team.dbId,
				useCaseId: useCase.id,
			}),
		),
	);
	return NextResponse.json({ reports });
}

export async function POST(request: Request) {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return NextResponse.json(
			{ error: "Invalid JSON body. Expected useCaseId." },
			{ status: 400 },
		);
	}

	const parsed = simulateUseCaseSchema.safeParse(payload);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid request body. Expected useCaseId." },
			{ status: 400 },
		);
	}
	if (!isKnownUseCaseId(parsed.data.useCaseId)) {
		return NextResponse.json({ error: "Unknown useCaseId." }, { status: 404 });
	}

	const team = await fetchCurrentTeam();
	const report = await simulateUseCaseForTeam({
		teamDbId: team.dbId,
		useCaseId: parsed.data.useCaseId,
	});
	return NextResponse.json({ report });
}
