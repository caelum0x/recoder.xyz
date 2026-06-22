// Recoder-owned mem0 factory. Pruned to the providers Recoder ships SDKs for
// (cloud LLM + Qdrant per docs/agent-os/16-oss-ownership-merge-plan.md). Dropped
// upstream providers that pulled uninstalled deps (cloudflare/vectorize,
// @azure/search-documents, langchain, supabase, lmstudio, mistral, groq, deepseek).
// Re-add a provider here together with its dependency in packages/mem0/package.json.
import { OpenAIEmbedder } from "../embeddings/openai";
import { OllamaEmbedder } from "../embeddings/ollama";
import { OpenAILLM } from "../llms/openai";
import { OpenAIStructuredLLM } from "../llms/openai_structured";
import { AnthropicLLM } from "../llms/anthropic";
import { MemoryVectorStore } from "../vector_stores/memory";
import {
  EmbeddingConfig,
  HistoryStoreConfig,
  LLMConfig,
  VectorStoreConfig,
} from "../types";
import { Embedder } from "../embeddings/base";
import { LLM } from "../llms/base";
import { VectorStore } from "../vector_stores/base";
import { Qdrant } from "../vector_stores/qdrant";
import { RedisDB } from "../vector_stores/redis";
import { OllamaLLM } from "../llms/ollama";
import { SQLiteManager } from "../storage/SQLiteManager";
import { MemoryHistoryManager } from "../storage/MemoryHistoryManager";
import { HistoryManager } from "../storage/base";
import { GoogleEmbedder } from "../embeddings/google";
import { GoogleLLM } from "../llms/google";
import { PGVector } from "../vector_stores/pgvector";

export class EmbedderFactory {
  static create(provider: string, config: EmbeddingConfig): Embedder {
    switch (provider.toLowerCase()) {
      case "openai":
        return new OpenAIEmbedder(config);
      case "ollama":
        return new OllamaEmbedder(config);
      case "google":
      case "gemini":
        return new GoogleEmbedder(config);
      default:
        throw new Error(`Unsupported embedder provider for @recoder/mem0: ${provider}`);
    }
  }
}

export class LLMFactory {
  static create(provider: string, config: LLMConfig): LLM {
    switch (provider.toLowerCase()) {
      case "openai":
        return new OpenAILLM(config);
      case "openai_structured":
        return new OpenAIStructuredLLM(config);
      case "anthropic":
        return new AnthropicLLM(config);
      case "ollama":
        return new OllamaLLM(config);
      case "google":
      case "gemini":
        return new GoogleLLM(config);
      default:
        throw new Error(`Unsupported LLM provider for @recoder/mem0: ${provider}`);
    }
  }
}

export class VectorStoreFactory {
  static create(provider: string, config: VectorStoreConfig): VectorStore {
    switch (provider.toLowerCase()) {
      case "memory":
        return new MemoryVectorStore(config);
      case "qdrant":
        return new Qdrant(config as any);
      case "redis":
        return new RedisDB(config as any);
      case "pgvector":
        return new PGVector(config as any);
      default:
        throw new Error(`Unsupported vector store provider for @recoder/mem0: ${provider}`);
    }
  }
}

export class HistoryManagerFactory {
  static create(provider: string, config: HistoryStoreConfig): HistoryManager {
    switch (provider.toLowerCase()) {
      case "sqlite":
        return new SQLiteManager(config.config.historyDbPath || ":memory:");
      case "memory":
        return new MemoryHistoryManager();
      default:
        throw new Error(`Unsupported history store provider for @recoder/mem0: ${provider}`);
    }
  }
}
