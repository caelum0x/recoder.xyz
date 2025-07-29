import type { ModelInfo } from "@roo-code/types"
import type { ApiHandlerOptions } from "../../shared/api"
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

const TOGETHER_MODELS = {
	"meta-llama/meta-llama-3.3-70b-instruct-turbo": {
		maxTokens: 8192,
		supportsImages: false,
		description: "Meta Llama 3.3 70B Instruct Turbo",
	},
	"meta-llama/llama-3.1-70b-instruct-turbo": {
		maxTokens: 8192,
		supportsImages: false,
		description: "Meta Llama 3.1 70B Instruct Turbo",
	},
	"meta-llama/llama-3.1-8b-instruct-turbo": {
		maxTokens: 8192,
		supportsImages: false,
		description: "Meta Llama 3.1 8B Instruct Turbo",
	},
	"mistralai/mistral-large-2407": {
		maxTokens: 32768,
		supportsImages: false,
		description: "Mistral Large 2407",
	},
	"qwen/qwen-2.5-72b-instruct-turbo": {
		maxTokens: 32768,
		supportsImages: false,
		description: "Qwen 2.5 72B Instruct Turbo",
	},
	"deepseek-ai/deepseek-llm-67b-chat": {
		maxTokens: 4096,
		supportsImages: false,
		description: "DeepSeek LLM 67B Chat",
	},
	"shisa-ai/shisa-v2-llama-3.3-70b": {
		maxTokens: 8192,
		supportsImages: false,
		description: "Shisa v2 Llama 3.3 70B",
	},
	"deephermes-3-mistral-24b": {
		maxTokens: 4096,
		supportsImages: false,
		description: "Deep Hermes 3 Mistral 24B",
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
			defaultProviderModelId: "meta-llama/meta-llama-3.3-70b-instruct-turbo",
			providerModels: TOGETHER_MODELS,
			defaultTemperature: 0.1,
			apiKey,
			...options,
		})
	}
}