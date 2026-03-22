import { createOpenAI } from "@ai-sdk/openai";

/**
 * Default model to use for agency AI operations via OpenRouter.
 * OpenRouter model IDs use the format "provider/model-name".
 */
const DEFAULT_MODEL_ID = "openai/gpt-4o-mini";

/**
 * Create an AI SDK model instance routed through OpenRouter.
 *
 * Uses `@ai-sdk/openai` with a custom baseURL pointed at OpenRouter,
 * so we don't need `@ai-sdk/openrouter` as a separate dependency.
 *
 * @param modelId - OpenRouter model ID (default: "openai/gpt-4o-mini")
 * @returns AI SDK model instance, or null if OPENROUTER_API_KEY is not set
 */
export function createOpenRouterModel(modelId: string = DEFAULT_MODEL_ID) {
	const apiKey = process.env.OPENROUTER_API_KEY;
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
export function requireOpenRouterModel(modelId: string = DEFAULT_MODEL_ID) {
	const model = createOpenRouterModel(modelId);
	if (!model) {
		throw new Error(
			"No AI API key configured. Set OPENROUTER_API_KEY environment variable.",
		);
	}
	return model;
}
