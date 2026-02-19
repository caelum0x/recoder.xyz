"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiStudioUseCaseId } from "@recoder/ecosystem-config";
import type { UseCaseReadiness, UseCaseReadinessMap } from "@/lib/use-cases/readiness";

type UseCaseReadinessResponse = {
	readiness: UseCaseReadiness[];
};

export function useUseCaseReadiness() {
	const [readinessMap, setReadinessMap] = useState<UseCaseReadinessMap>({});
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const response = await fetch("/api/use-cases/readiness", {
					cache: "no-store",
				});
				if (!response.ok) {
					throw new Error(`Failed to fetch readiness: ${response.status}`);
				}
				const data = (await response.json()) as UseCaseReadinessResponse;
				if (cancelled) return;

				const nextMap = data.readiness.reduce<UseCaseReadinessMap>(
					(acc, item) => {
						acc[item.useCaseId] = item;
						return acc;
					},
					{},
				);
				setReadinessMap(nextMap);
			} catch (error) {
				console.error(error);
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	const getUseCaseReadiness = useMemo(
		() => (useCaseId: AiStudioUseCaseId) => readinessMap[useCaseId],
		[readinessMap],
	);

	return { readinessMap, getUseCaseReadiness, isLoading };
}
