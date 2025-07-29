import type { ModelInfo } from "@roo-code/types"
import type { ApiHandlerOptions } from "../../shared/api"
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

const HUGGINGFACE_MODELS = {
	"mistralai/mistral-large-2407": {
		maxTokens: 32768,
		supportsImages: false,
		description: "Mistral Large 2407",
	},
	"microsoft/phi-3.5-mini-128k-instruct": {
		maxTokens: 128000,
		supportsImages: false,
		description: "Microsoft Phi-3.5 Mini 128K Instruct",
	},
	"meta-llama/llama-3.1-70b-instruct": {
		maxTokens: 8192,
		supportsImages: false,
		description: "Meta Llama 3.1 70B Instruct",
	},
	"meta-llama/llama-3.1-8b-instruct": {
		maxTokens: 8192,
		supportsImages: false,
		description: "Meta Llama 3.1 8B Instruct",
	},
	"codellama/codellama-13b-instruct-hf": {
		maxTokens: 4096,
		supportsImages: false,
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
			baseURL: "https://api-inference.huggingface.co/models",
			defaultProviderModelId: "mistralai/mistral-large-2407",
			providerModels: HUGGINGFACE_MODELS,
			defaultTemperature: 0.1,
			apiKey,
			...options,
		})
	}

	override getModel() {
		const { id, info } = super.getModel()
		
		// For HuggingFace, we need to append the chat completions endpoint
		return {
			id: `${id}/v1/chat/completions`,
			info,
		}
	}
}