import { ApiHandlerOptions, ModelRecord } from "../../shared/api"
import { OpenRouterHandler } from "./openrouter"
import { getModelParams } from "../transform/model-params"
import { getModels } from "./fetchers/modelCache"
import { DEEP_SEEK_DEFAULT_TEMPERATURE, recoderDefaultModelId } from "@roo-code/types"
import { getRecoderBaseUriFromToken } from "../../utils/recoder-token"
import { ApiHandlerCreateMessageMetadata } from ".."
import OpenAI from "openai"
import { getModelEndpoints } from "./fetchers/modelEndpointCache"

/**
 * A custom OpenRouter handler that overrides the getModel function
 * to provide custom model information and fetches models from the KiloCode OpenRouter endpoint.
 */
export class RecoderOpenrouterHandler extends OpenRouterHandler {
	protected override models: ModelRecord = {}

	constructor(options: ApiHandlerOptions) {
		const baseUri = getRecoderBaseUriFromToken(options.openRouterApiKey ?? "")
		options = {
			...options,
			openRouterBaseUrl: `${baseUri}/api/openrouter/`,
		}
		super(options)
	}

	override customRequestOptions(metadata?: ApiHandlerCreateMessageMetadata): OpenAI.RequestOptions | undefined {
		return metadata
			? {
				headers: {
					"X-Recoder-TaskId": metadata.taskId,
				},
			}
			: undefined
	}

	override getModel() {
		let id
		let info
		let defaultTemperature = 0

		const selectedModel = this.options.openRouterModelId ?? recoderDefaultModelId

		// Map the selected model to the corresponding OpenRouter model ID
		const modelMapping = {
			gemini25: "google/gemini-2.5-pro-preview",
			gpt41: "openai/gpt-4.1",
			gemini25flashpreview: "google/gemini-2.5-flash-preview",
			claude37: "anthropic/claude-3.7-sonnet",
		}

		id = selectedModel
		if (Object.keys(modelMapping).includes(selectedModel)) {
			id = modelMapping[selectedModel as keyof typeof modelMapping]
		}

		if (Object.keys(this.models).length === 0) {
			throw new Error("Failed to load Recoder provider model list.")
		} else if (this.models[id]) {
			info = this.models[id]
		} else {
			throw new Error(`Unsupported model: ${selectedModel}`)
		}

		if (this.options.openRouterSpecificProvider && this.endpoints[this.options.openRouterSpecificProvider]) {
			info = this.endpoints[this.options.openRouterSpecificProvider]
		}

		const isDeepSeekR1 = id.startsWith("deepseek/deepseek-r1") || id === "perplexity/sonar-reasoning"

		const params = getModelParams({
			format: "openrouter",
			modelId: id,
			model: info,
			settings: this.options,
			defaultTemperature: isDeepSeekR1 ? DEEP_SEEK_DEFAULT_TEMPERATURE : defaultTemperature,
		})

		return { id, info, topP: isDeepSeekR1 ? 0.95 : undefined, ...params }
	}

	public override async fetchModel() {
		if (!this.options.openRouterApiKey || !this.options.openRouterBaseUrl) {
			throw new Error("OpenRouter API key + baseUrl is required to fetch models")
		}

		const [models, endpoints] = await Promise.all([
			getModels({
				provider: "recoder-openrouter",
				recoderToken: this.options.openRouterApiKey,
			}),
			getModelEndpoints({
				router: "openrouter",
				modelId: this.options.openRouterModelId,
				endpoint: this.options.openRouterSpecificProvider,
			}),
		])

		this.models = models
		this.endpoints = endpoints
		return this.getModel()
	}
}
