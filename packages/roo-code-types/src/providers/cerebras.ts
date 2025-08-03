import { z } from "zod"
import { modelInfoSchema } from "../model"

/**
 * Cerebras provider types and models
 */

export const cerebrasModelIds = [
	"llama3.1-8b",
	"llama3.1-70b",
] as const

export const cerebrasModelIdsSchema = z.enum(cerebrasModelIds)
export type CerebrasModelId = z.infer<typeof cerebrasModelIdsSchema>

export const cerebrasDefaultModelId: CerebrasModelId = "llama3.1-8b"

export const cerebrasModels: Record<CerebrasModelId, z.infer<typeof modelInfoSchema>> = {
	"llama3.1-8b": {
		contextWindow: 128000,
		maxTokens: 8192,
		inputPrice: 0.1,
		outputPrice: 0.1,
		supportsImages: false,
		supportsPromptCache: false,
	},
	"llama3.1-70b": {
		contextWindow: 128000,
		maxTokens: 8192,
		inputPrice: 0.6,
		outputPrice: 0.6,
		supportsImages: false,
		supportsPromptCache: false,
	},
}

export const CEREBRAS_DEFAULT_TEMPERATURE = 0.7