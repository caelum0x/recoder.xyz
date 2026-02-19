import type { AiStudioUseCaseId } from "@recoder/ecosystem-config";

export type UseCaseReadinessStatus = "ready" | "ingesting" | "setup_required";

export interface UseCaseReadiness {
	useCaseId: AiStudioUseCaseId;
	status: UseCaseReadinessStatus;
	message: string;
	actionPath: string | null;
	actionLabel: string | null;
}

export type UseCaseReadinessMap = Partial<
	Record<AiStudioUseCaseId, UseCaseReadiness>
>;
