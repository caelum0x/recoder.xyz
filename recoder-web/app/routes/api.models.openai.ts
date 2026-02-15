/**
 * OpenAI Model List API
 * Uses OPENAI_API_KEY to fetch available models.
 */

import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ModelsOpenAI');

type OpenAiModelsResponse = {
  data?: { id?: string }[];
};

export async function loader({ context }: LoaderFunctionArgs) {
  const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    return json({ models: [], error: 'OPENAI_API_KEY is not set' }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`OpenAI API returned ${response.status}`);
    }

    const data = await response.json() as OpenAiModelsResponse;
    const models = (data.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => Boolean(id))
      .sort();

    return json({ models });
  } catch (error) {
    logger.error('OpenAI model list fetch error:', error);
    return json({ models: [], error: 'Failed to fetch OpenAI models' }, { status: 500 });
  }
}
