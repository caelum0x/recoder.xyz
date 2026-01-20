/**
 * OpenAI Embeddings wrapper for code indexing
 * Uses text-embedding-3-small for cost-effective semantic search
 */

export interface EmbeddingResult {
  embeddings: number[][];
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface EmbedderConfig {
  apiKey: string;
  model?: string;
  batchSize?: number;
}

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Create embeddings for text using OpenAI API
 */
export async function createEmbeddings(
  texts: string[],
  config: EmbedderConfig
): Promise<EmbeddingResult> {
  const model = config.model || DEFAULT_MODEL;
  const batchSize = config.batchSize || DEFAULT_BATCH_SIZE;

  if (texts.length === 0) {
    return { embeddings: [], usage: { promptTokens: 0, totalTokens: 0 } };
  }

  const allEmbeddings: number[][] = [];
  let totalPromptTokens = 0;
  let totalTokens = 0;

  // Process in batches
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const result = await embedBatchWithRetry(batch, model, config.apiKey);

    allEmbeddings.push(...result.embeddings);
    totalPromptTokens += result.usage.promptTokens;
    totalTokens += result.usage.totalTokens;
  }

  return {
    embeddings: allEmbeddings,
    usage: {
      promptTokens: totalPromptTokens,
      totalTokens: totalTokens,
    },
  };
}

/**
 * Create embedding for a single query (optimized for search)
 */
export async function createQueryEmbedding(
  query: string,
  config: EmbedderConfig
): Promise<number[]> {
  const result = await createEmbeddings([query], config);
  return result.embeddings[0];
}

async function embedBatchWithRetry(
  texts: string[],
  model: string,
  apiKey: string
): Promise<EmbeddingResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await embedBatch(texts, model, apiKey);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check for rate limit
      if (lastError.message.includes('429') || lastError.message.includes('rate')) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`Rate limited, waiting ${delay}ms before retry ${attempt + 1}/${MAX_RETRIES}`);
        await sleep(delay);
        continue;
      }

      // Don't retry on other errors
      throw lastError;
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

async function embedBatch(
  texts: string[],
  model: string,
  apiKey: string
): Promise<EmbeddingResult> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[]; index: number }>;
    usage: { prompt_tokens: number; total_tokens: number };
  };

  // Sort by index to maintain order
  const sortedData = data.data.sort((a, b) => a.index - b.index);

  return {
    embeddings: sortedData.map(d => d.embedding),
    usage: {
      promptTokens: data.usage.prompt_tokens,
      totalTokens: data.usage.total_tokens,
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get embedding dimension for a model
 */
export function getEmbeddingDimension(model: string = DEFAULT_MODEL): number {
  const dimensions: Record<string, number> = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536,
  };
  return dimensions[model] || 1536;
}
