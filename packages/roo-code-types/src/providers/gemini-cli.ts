import { z } from "zod"
import { modelInfoSchema } from "../model"

/**
 * Gemini CLI provider types and models
 */

export const geminiCliModelIds = [
	"gemini-2.0-flash-001",
	"gemini-1.5-flash-001",
	"gemini-1.5-pro-001",
] as const

export const geminiCliModelIdsSchema = z.enum(geminiCliModelIds)
export type GeminiCliModelId = z.infer<typeof geminiCliModelIdsSchema>

export const geminiCliDefaultModelId: GeminiCliModelId = "gemini-2.0-flash-001"

export const geminiCliModels: Record<GeminiCliModelId, z.infer<typeof modelInfoSchema>> = {
	"gemini-2.0-flash-001": {
		contextWindow: 1048576,
		maxTokens: 8192,
		inputPrice: 0.0015,
		outputPrice: 0.006,
		supportsImages: true,
		supportsPromptCache: false,
	},
	"gemini-1.5-flash-001": {
		contextWindow: 1048576,
		maxTokens: 8192,
		inputPrice: 0.075,
		outputPrice: 0.3,
		supportsImages: true,
		supportsPromptCache: false,
	},
	"gemini-1.5-pro-001": {
		contextWindow: 2097152,
		maxTokens: 8192,
		inputPrice: 1.25,
		outputPrice: 5.0,
		supportsImages: true,
		supportsPromptCache: false,
	},
}

export const GEMINI_CLI_DEFAULT_TEMPERATURE = 0.7