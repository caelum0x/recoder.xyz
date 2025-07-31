import type { ModelInfo } from "@recoder/shared"
import type { ApiHandlerOptions } from "@recoder/shared"
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

const HUGGINGFACE_MODELS = {
	"mistralai/mistral-large-2407": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		description: "Mistral Large 2407",
	},
	"microsoft/phi-3.5-mini-128k-instruct": {
		maxTokens: 128000,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		description: "Microsoft Phi-3.5 Mini 128K Instruct",
	},
	"meta-llama/llama-3.1-70b-instruct": {
		maxTokens: 8192,
		contextWindow: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		description: "Meta Llama 3.1 70B Instruct",
	},
	"meta-llama/llama-3.1-8b-instruct": {
		maxTokens: 8192,
		contextWindow: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		description: "Meta Llama 3.1 8B Instruct",
	},
	"codellama/codellama-13b-instruct-hf": {
		maxTokens: 4096,
		contextWindow: 4096,
		supportsImages: false,
		supportsPromptCache: false,
		description: "Code Llama 13B Instruct",
	},
} as const satisfies Record<string, ModelInfo>

type HuggingFaceModelName = keyof typeof HUGGINGFACE_MODELS

export class HuggingFaceHandler extends BaseOpenAiCompatibleProvider<HuggingFaceModelName> {
	constructor(options: ApiHandlerOptions) {
		const apiKey = options.huggingFaceApiKey ?? options.apiKey

		if (!apiKey) {
			throw new Error("HuggingFace API key is required")
		}

		super({
			providerName: "HuggingFace",
			baseURL: "https://api-inference.huggingface.co/models", // Base URL, model-specific endpoints will be handled by the provider
			defaultProviderModelId: "mistralai/mistral-large-2407",
			providerModels: HUGGINGFACE_MODELS,
			defaultTemperature: 0.1,
			apiKey,
			...options,
		})
	}

	// getModel is inherited from BaseOpenAiCompatibleProvider
}