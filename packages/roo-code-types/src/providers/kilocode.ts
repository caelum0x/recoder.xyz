import { z } from "zod"
import { modelInfoSchema } from "../model"

/**
 * Kilocode AI provider types and models
 */

export const kilocodeModelIds = [
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "gpt-4o",
  "gpt-4o-mini",
] as const

export const kilocodeModelIdsSchema = z.enum(kilocodeModelIds)
export type KilocodeModelId = z.infer<typeof kilocodeModelIdsSchema>

export const kilocodeDefaultModelId: KilocodeModelId = "claude-3-5-sonnet-20241022"

export const kilocodeModels: Record<KilocodeModelId, z.infer<typeof modelInfoSchema>> = {
  "claude-3-5-sonnet-20241022": {
    contextWindow: 200000,
    maxTokens: 8192,
    inputPrice: 3.0,
    outputPrice: 15.0,
    supportsImages: true,
    supportsPromptCache: true,
  },
  "claude-3-5-haiku-20241022": {
    contextWindow: 200000,
    maxTokens: 8192,
    inputPrice: 1.0,
    outputPrice: 5.0,
    supportsImages: true,
    supportsPromptCache: true,
  },
  "gpt-4o": {
    contextWindow: 128000,
    maxTokens: 4096,
    inputPrice: 5.0,
    outputPrice: 15.0,
    supportsImages: true,
    supportsPromptCache: false,
  },
  "gpt-4o-mini": {
    contextWindow: 128000,
    maxTokens: 4096,
    inputPrice: 0.15,
    outputPrice: 0.6,
    supportsImages: true,
    supportsPromptCache: false,
  },
}

export const KILOCODE_DEFAULT_TEMPERATURE = 0.7