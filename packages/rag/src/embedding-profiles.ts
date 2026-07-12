import * as z from "zod/v4";

// Vendored from the former @recoder/protocol `embedding` module. That package
// was part of the Giselle cluster removed in commit e41c2bb2 ("remove Polar,
// lance, and the pure Giselle cluster"); this self-contained copy keeps @recoder/rag
// installable without resurrecting the whole Giselle registry cluster it depended on.

export const EmbeddingProvider = z.enum(["openai", "google", "cohere"]);
export type EmbeddingProvider = z.infer<typeof EmbeddingProvider>;

export const OpenAIEmbeddingModel = z.enum([
	"text-embedding-3-small",
	"text-embedding-3-large",
]);
export type OpenAIEmbeddingModel = z.infer<typeof OpenAIEmbeddingModel>;

export const GeminiEmbeddingModel = z.enum(["gemini-embedding-001"]);
export type GeminiEmbeddingModel = z.infer<typeof GeminiEmbeddingModel>;

export const CohereEmbeddingModel = z.enum(["embed-4"]);
export type CohereEmbeddingModel = z.infer<typeof CohereEmbeddingModel>;

export const EmbeddingModelId = z.union([
	OpenAIEmbeddingModel,
	GeminiEmbeddingModel,
	CohereEmbeddingModel,
]);
export type EmbeddingModelId = z.infer<typeof EmbeddingModelId>;

export const EmbeddingDimensions = z.union([
	z.literal(1024),
	z.literal(1536),
	z.literal(3072),
]);
export type EmbeddingDimensions = z.infer<typeof EmbeddingDimensions>;

export type EmbeddingProfile = {
	provider: EmbeddingProvider;
	model: EmbeddingModelId;
	dimensions: EmbeddingDimensions;
	name: string;
};

export const EMBEDDING_PROFILES = {
	1: {
		provider: "openai" as const,
		model: "text-embedding-3-small" as const,
		dimensions: 1536 as const,
		name: "OpenAI text-embedding-3-small",
	},
	2: {
		provider: "openai" as const,
		model: "text-embedding-3-large" as const,
		dimensions: 3072 as const,
		name: "OpenAI text-embedding-3-large",
	},
	3: {
		provider: "google" as const,
		model: "gemini-embedding-001" as const,
		dimensions: 3072 as const,
		name: "Google gemini-embedding-001",
	},
	4: {
		provider: "cohere" as const,
		model: "embed-4" as const,
		dimensions: 1536 as const,
		name: "Cohere embed-4",
	},
} as const satisfies Record<number, EmbeddingProfile>;

export type EmbeddingProfileId = keyof typeof EMBEDDING_PROFILES;

export const DEFAULT_EMBEDDING_PROFILE_ID: EmbeddingProfileId = 1;

export function isEmbeddingProfileId(id: number): id is EmbeddingProfileId {
	return id in EMBEDDING_PROFILES;
}

// Schema for validating embedding profile IDs against known profiles.
export const EmbeddingProfileIdSchema = z.custom<EmbeddingProfileId>(
	(val) =>
		typeof val === "number" &&
		Number.isInteger(val) &&
		isEmbeddingProfileId(val as number),
	{ message: "Invalid embedding profile id" },
);
