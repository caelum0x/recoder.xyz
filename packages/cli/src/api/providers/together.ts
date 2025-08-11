import type { ModelInfo } from "@recoder/shared"
import type { ApiHandlerOptions } from "@recoder/shared"
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

const TOGETHER_MODELS = {
	// FREE MODELS (Prioritized for cost efficiency) 
	"meta-llama/llama-vision-free": {
		maxTokens: 8192,
		contextWindow: 8192,
		supportsImages: true,
		supportsPromptCache: false,
		description: "Meta Llama Vision - FREE",
		cost: "free"
	},
	"deepseek-ai/deepseek-r1-distill-llama-70b": {
		maxTokens: 8192,
		contextWindow: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		description: "DeepSeek R1 Distill Llama 70B - FREE",
		cost: "free"
	},
	"NousResearch/nous-hermes-llama-3.3-70b-instruct-turbo": {
		maxTokens: 8192,
		contextWindow: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		description: "Meta Llama 3.3 70B Instruct Turbo - FREE",
		cost: "free"
	},
	"LGAI-EXAONE/exaone-deep-32b": {
		maxTokens: 4096,
		contextWindow: 4096,
		supportsImages: false,
		supportsPromptCache: false,
		description: "EXAONE Deep 32B - FREE",
		cost: "free"
	},
	"LGAI-EXAONE/exaone-3.5-32b-instruct": {
		maxTokens: 4096,
		contextWindow: 4096,
		supportsImages: false,
		supportsPromptCache: false,
		description: "EXAONE 3.5 32B Instruct - FREE",
		cost: "free"
	},
	// PAID MODELS (Low cost)
	"meta-llama/meta-llama-3.3-70b-instruct-turbo": {
		maxTokens: 8192,
		contextWindow: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		description: "Meta Llama 3.3 70B Instruct Turbo",
		cost: "paid"
	},
	"meta-llama/llama-3.1-70b-instruct-turbo": {
		maxTokens: 8192,
		contextWindow: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		description: "Meta Llama 3.1 70B Instruct Turbo",
		cost: "paid"
	},
	"meta-llama/llama-3.1-8b-instruct-turbo": {
		maxTokens: 8192,
		contextWindow: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		description: "Meta Llama 3.1 8B Instruct Turbo",
		cost: "paid"
	},
	"mistralai/mistral-large-2407": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		description: "Mistral Large 2407",
		cost: "paid"
	},
	"qwen/qwen-2.5-72b-instruct-turbo": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		description: "Qwen 2.5 72B Instruct Turbo",
		cost: "paid"
	},
	"deepseek-ai/deepseek-llm-67b-chat": {
		maxTokens: 4096,
		contextWindow: 4096,
		supportsImages: false,
		supportsPromptCache: false,
		description: "DeepSeek LLM 67B Chat",
		cost: "paid"
	},
} as const satisfies Record<string, ModelInfo>

type TogetherModelName = keyof typeof TOGETHER_MODELS

export class TogetherHandler extends BaseOpenAiCompatibleProvider<TogetherModelName> {
	constructor(options: ApiHandlerOptions) {
		const apiKey = options.togetherApiKey ?? options.apiKey

		if (!apiKey) {
			throw new Error("Together AI API key is required")
		}

		super({
			providerName: "Together AI",
			baseURL: "https://api.together.xyz/v1",
			defaultProviderModelId: "deepseek-ai/deepseek-r1-distill-llama-70b", // Free DeepSeek model
			providerModels: TOGETHER_MODELS,
			defaultTemperature: 0.1,
			apiKey,
			...options,
		})
	}
}