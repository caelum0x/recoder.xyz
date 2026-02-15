"use client";

import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import {
	type AiStudioUseCase,
	type AiStudioUseCaseId,
} from "@recoder/ecosystem-config";
import { useUseCaseReadiness } from "../use-cases/use-use-case-readiness";

interface UseCaseBootstrapGridProps {
	useCases: readonly AiStudioUseCase[];
}

export function UseCaseBootstrapGrid({ useCases }: UseCaseBootstrapGridProps) {
	const [bootstrappingUseCaseId, setBootstrappingUseCaseId] = useState<
		AiStudioUseCaseId | null
	>(null);
	const router = useRouter();
	const { getUseCaseReadiness, isLoading: isReadinessLoading } =
		useUseCaseReadiness();
	const posthog = usePostHog();

	const handleBootstrap = async (useCaseId: AiStudioUseCaseId) => {
		if (bootstrappingUseCaseId !== null) return;
		const readiness = getUseCaseReadiness(useCaseId);
		if (readiness?.status === "setup_required" && readiness.actionPath) {
			posthog?.capture("use_case_bootstrap_blocked", {
				useCaseId,
				source: "lobby_v2",
				reason: "setup_required",
			});
			router.push(readiness.actionPath);
			return;
		}
		posthog?.capture("use_case_bootstrap_requested", {
			useCaseId,
			source: "lobby_v2",
		});
		setBootstrappingUseCaseId(useCaseId);
		try {
			const response = await fetch("/api/use-cases/bootstrap", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ useCaseId }),
			});
			if (!response.ok) {
				if (response.status === 409) {
					const conflictData = (await response.json()) as {
						readiness?: { actionPath?: string | null };
					};
					if (conflictData.readiness?.actionPath) {
						posthog?.capture("use_case_bootstrap_blocked", {
							useCaseId,
							source: "lobby_v2",
							reason: "server_setup_required",
						});
						router.push(conflictData.readiness.actionPath);
						setBootstrappingUseCaseId(null);
						return;
					}
				}
				throw new Error(`Failed to bootstrap use case: ${response.status}`);
			}
			const data = (await response.json()) as {
				redirectPath?: string;
				starterTemplateApplied?: boolean;
			};
			if (!data.redirectPath) {
				throw new Error("Missing redirect path");
			}
			posthog?.capture("use_case_bootstrap_succeeded", {
				useCaseId,
				source: "lobby_v2",
				starterTemplateApplied: data.starterTemplateApplied ?? false,
			});
			router.push(data.redirectPath);
		} catch (error) {
			posthog?.capture("use_case_bootstrap_failed", {
				useCaseId,
				source: "lobby_v2",
			});
			console.error(error);
			setBootstrappingUseCaseId(null);
		}
	};

	return (
		<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
			{useCases.map((useCase) => (
				<button
					key={useCase.id}
					type="button"
					onClick={() => handleBootstrap(useCase.id)}
					disabled={bootstrappingUseCaseId !== null}
					className="rounded-[8px] p-4 bg-surface/30 border border-border/10 text-left text-text/80 text-sm hover:bg-surface/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
				>
					<p className="font-semibold mb-1">{useCase.title}</p>
					<p className="text-xs text-text/60">{useCase.summary}</p>
					{(() => {
						const readiness = getUseCaseReadiness(useCase.id);
						if (!readiness) {
							return isReadinessLoading ? (
								<p className="mt-2 text-[11px] text-text/60">
									Checking readiness...
								</p>
							) : null;
						}
						const statusLabel =
							readiness.status === "ready"
								? "Ready"
								: readiness.status === "ingesting"
									? "Ingesting"
									: "Setup required";
						const statusColorClass =
							readiness.status === "ready"
								? "text-emerald-300"
								: readiness.status === "ingesting"
									? "text-amber-300"
									: "text-orange-300";
						return (
							<div className="mt-2">
								<p className={`text-[11px] ${statusColorClass}`}>{statusLabel}</p>
								<p className="text-[11px] text-text/60 line-clamp-2">
									{readiness.message}
								</p>
							</div>
						);
					})()}
					{bootstrappingUseCaseId === useCase.id ? (
						<p className="mt-2 text-[11px] text-primary-100">
							Creating workspace...
						</p>
					) : null}
				</button>
			))}
		</div>
	);
}
