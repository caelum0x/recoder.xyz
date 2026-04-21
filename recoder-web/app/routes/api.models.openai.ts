/**
 * OpenAI Model List API
 * Uses the user's BYOK OpenAI key to fetch available models.
 */

import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';
import { getAPIKey } from '~/lib/.server/llm/api-key';

const logger = createScopedLogger('ModelsOpenAI');

type OpenAiModelsResponse = {
  data?: { id?: string }[];
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const apiKey = await getAPIKey((context as any)?.cloudflare?.env, request, 'openai');

  if (!apiKey) {
    return json({ models: [], error: 'No OpenAI BYOK key configured' }, { status: 400 });
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
