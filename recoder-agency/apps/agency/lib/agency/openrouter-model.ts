import { createOpenAI } from "@ai-sdk/openai";
import { cookies } from "next/headers";

/**
 * Default model to use for agency AI operations via OpenRouter.
 * OpenRouter model IDs use the format "provider/model-name".
 */
const DEFAULT_MODEL_ID = "google/gemini-2.0-flash-001";

function getMainAppUrl(): string {
	return (
		process.env.MAIN_SITE_URL ||
		process.env.NEXT_PUBLIC_APP_URL ||
		"https://recoder.xyz"
	);
}

export async function getUserOpenRouterApiKeyForAgency(): Promise<string | null> {
	const cookieStore = await cookies();
	const cookieHeader = cookieStore
		.getAll()
		.map((cookie) => `${cookie.name}=${cookie.value}`)
		.join("; ");

	if (!cookieHeader) {
		return null;
	}

	try {
		const response = await fetch(
			`${getMainAppUrl()}/api/user/ai-provider-keys/decrypt?provider=openrouter`,
			{
				method: "GET",
				headers: {
					Cookie: cookieHeader,
					"Content-Type": "application/json",
				},
				cache: "no-store",
			},
		);

		if (!response.ok) {
			return null;
		}

		const payload = (await response.json()) as {
			success?: boolean;
			apiKey?: string;
		};

		return payload.success && payload.apiKey ? payload.apiKey : null;
	} catch {
		return null;
	}
}

/**
 * Create an AI SDK model instance routed through OpenRouter.
 *
 * Uses `@ai-sdk/openai` with a custom baseURL pointed at OpenRouter,
 * so we don't need `@ai-sdk/openrouter` as a separate dependency.
 *
 * @param modelId - OpenRouter model ID (default: "openai/gpt-4o-mini")
 * @returns AI SDK model instance, or null if the user has no BYOK OpenRouter key
 */
export async function createOpenRouterModel(modelId: string = DEFAULT_MODEL_ID) {
	const apiKey = await getUserOpenRouterApiKeyForAgency();
	if (!apiKey) {
		return null;
	}

	const openrouter = createOpenAI({
		apiKey,
		baseURL: "https://openrouter.ai/api/v1",
	});

	return openrouter(modelId);
}

/**
 * Create an AI SDK model instance routed through OpenRouter.
 * Throws if OPENROUTER_API_KEY is not configured.
 *
 * @param modelId - OpenRouter model ID (default: "openai/gpt-4o-mini")
 * @returns AI SDK model instance
 */
export async function requireOpenRouterModel(modelId: string = DEFAULT_MODEL_ID) {
	const model = await createOpenRouterModel(modelId);
	if (!model) {
		throw new Error(
			"No BYOK OpenRouter API key configured for this user.",
		);
	}
	return model;
}
