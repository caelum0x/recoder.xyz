import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed, embedMany } from "ai";
import { ConfigurationError, EmbeddingError } from "./errors";
import type {
  EmbedderConfig,
  EmbedderFunction,
  EmbeddingOptions,
  EmbeddingProfile,
  EmbeddingProfileId,
} from "./types";
import { EMBEDDING_PROFILES } from "./types";
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RAGEmbedder');

/**
 * Create an AI SDK embedder with the specified configuration
 */
export function createAiSdkEmbedder(
  config: EmbedderConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getModel: (modelName: string) => any
): EmbedderFunction {
  if (!config.apiKey || config.apiKey.length === 0) {
    throw ConfigurationError.missingField("apiKey");
  }

  const { model, provider, dimensions } = config.profile;
  const maxRetries = config.maxRetries ?? 3;
  const transport = config.transport ?? "provider";

  const normalizeUsage = (
    rawUsage: unknown
  ): { tokens: number; imageTokens?: number } | undefined => {
    if (!rawUsage || typeof rawUsage !== "object") {
      return undefined;
    }
    const usageWithNumbers = rawUsage as {
      tokens?: unknown;
      imageTokens?: unknown;
    };
    const hasTokens = typeof usageWithNumbers.tokens === "number";
    const tokens = hasTokens ? (usageWithNumbers.tokens as number) : 0;
    const normalized: { tokens: number; imageTokens?: number } = { tokens };
    const hasImageTokens = typeof usageWithNumbers.imageTokens === "number";
    if (hasImageTokens) {
      normalized.imageTokens = usageWithNumbers.imageTokens as number;
    }
    if (!hasTokens && !hasImageTokens) {
      return undefined;
    }
    return normalized;
  };

  return {
    async embed(text: string, options?: EmbeddingOptions): Promise<number[]> {
      try {
        const startTime = new Date();
        const result = await embed({
          model: getModel(model),
          maxRetries,
          value: text,
          headers: options?.headers,
        });

        if (config.embeddingComplete) {
          try {
            const usage = normalizeUsage(result.usage);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const resultAny = result as any;
            await config.embeddingComplete({
              texts: [text],
              embeddings: [result.embedding],
              model,
              provider,
              dimensions,
              usage,
              operation: "embed",
              startTime,
              endTime: new Date(),
              transport,
              providerMetadata: resultAny.providerMetadata,
            });
          } catch (error) {
            logger.error("Embedding callback error:", error);
          }
        }

        return result.embedding;
      } catch (error: unknown) {
        throw EmbeddingError.apiError(
          error instanceof Error ? error : new Error(String(error)),
          { operation: "embed", model }
        );
      }
    },

    async embedMany(
      texts: string[],
      options?: EmbeddingOptions
    ): Promise<number[][]> {
      try {
        const startTime = new Date();
        const result = await embedMany({
          model: getModel(model),
          maxRetries,
          values: texts,
          headers: options?.headers,
        });

        if (config.embeddingComplete) {
          try {
            const usage = normalizeUsage(result.usage);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const resultAny = result as any;
            await config.embeddingComplete({
              texts,
              embeddings: result.embeddings,
              model,
              provider,
              dimensions,
              usage,
              operation: "embedMany",
              startTime,
              endTime: new Date(),
              transport,
              providerMetadata: resultAny.providerMetadata,
            });
          } catch (error) {
            logger.error("Embedding callback error:", error);
          }
        }

        return result.embeddings;
      } catch (error: unknown) {
        throw EmbeddingError.apiError(
          error instanceof Error ? error : new Error(String(error)),
          { operation: "embedMany", model }
        );
      }
    },
    embeddingComplete: config.embeddingComplete,
  };
}

/**
 * Create an OpenAI embedder with the specified configuration
 */
export function createOpenAIEmbedder(config: EmbedderConfig): EmbedderFunction {
  const openai = createOpenAI({ apiKey: config.apiKey });

  return createAiSdkEmbedder(
    {
      ...config,
      transport: config.transport ?? "provider",
    },
    (modelName) => openai.embedding(modelName)
  );
}

/**
 * Create a Google embedder with the specified configuration
 */
export function createGoogleEmbedder(config: EmbedderConfig): EmbedderFunction {
  const google = createGoogleGenerativeAI({ apiKey: config.apiKey });

  return createAiSdkEmbedder(
    {
      ...config,
      transport: config.transport ?? "provider",
    },
    (modelName) => google.textEmbeddingModel(modelName)
  );
}

/**
 * Create a not-implemented embedder for unsupported providers
 */
export function createNotImplementedEmbedder(
  provider: string
): EmbedderFunction {
  return {
    embed() {
      return Promise.reject(
        new Error(`Embedder for provider ${provider} is not implemented`)
      );
    },
    embedMany() {
      return Promise.reject(
        new Error(`Embedder for provider ${provider} is not implemented`)
      );
    },
  };
}

export type CreateEmbedderFromProfileOptions = Pick<
  EmbedderConfig,
  "maxRetries" | "embeddingComplete" | "headers"
> & {
  transport?: "gateway" | "provider";
};

/**
 * Create an embedder from an embedding profile
 */
export function createEmbedderFromProfile(
  profileId: EmbeddingProfileId,
  apiKey: string,
  options?: CreateEmbedderFromProfileOptions
): EmbedderFunction {
  const profile = EMBEDDING_PROFILES[profileId];
  if (!profile) {
    throw ConfigurationError.invalidValue(
      "profileId",
      profileId,
      `one of: ${Object.keys(EMBEDDING_PROFILES).join(", ")}`
    );
  }

  const { transport = "provider", ...embedderOptions } = options ?? {};
  const normalizedTransport = transport === "gateway" ? "gateway" : "provider";

  switch (profile.provider) {
    case "openai":
      return createOpenAIEmbedder({
        apiKey,
        profile,
        transport: normalizedTransport,
        ...embedderOptions,
      });
    case "google":
      return createGoogleEmbedder({
        apiKey,
        profile,
        transport: normalizedTransport,
        ...embedderOptions,
      });
    case "cohere":
      return createNotImplementedEmbedder("cohere");
    default: {
      const _exhaustiveCheck: never = profile.provider;
      throw new Error(`Unknown provider: ${_exhaustiveCheck}`);
    }
  }
}

/**
 * Get API key for an embedding profile from an explicit provider-key map.
 */
export function getApiKeyForProfile(
  profile: EmbeddingProfile,
  providerKeys?: Partial<Record<EmbeddingProfile["provider"], string>>
): string | undefined {
  if (!providerKeys) {
    return undefined;
  }

  switch (profile.provider) {
    case "openai":
      return providerKeys.openai;
    case "google":
      return providerKeys.google;
    case "cohere":
      return providerKeys.cohere;
    default:
      return undefined;
  }
}
