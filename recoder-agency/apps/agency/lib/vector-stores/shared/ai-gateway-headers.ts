import type { TeamWithSubscription } from "@/services/teams";

/**
 * Build AI Gateway headers for billing attribution.
 * This function creates headers required for AI Gateway requests,
 * including Polar customer ID for usage tracking.
 */
export function buildAiGatewayHeaders(
	team: TeamWithSubscription | null,
): Record<string, string> {
	const headers: Record<string, string> = {
		"http-referer":
			process.env.AI_GATEWAY_HTTP_REFERER ?? "https://recoder.xyz",
		"x-title": process.env.AI_GATEWAY_X_TITLE ?? "Recoder Agency",
	};

	const polarCustomerId = team?.activeCustomerId ?? undefined;
	if (polarCustomerId !== undefined) {
		headers["polar-customer-id"] = polarCustomerId;
	} else if (team?.plan === "pro" || team?.plan === "team") {
		console.warn(
			`Polar customer ID not found for vector store ingest (team: ${team?.id})`,
		);
	}

	return headers;
}
