/**
 * Anthropic Model List API
 * Uses ANTHROPIC_API_KEY to fetch available models.
 */

import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ModelsAnthropic');

type AnthropicModelsResponse = {
  data?: { id?: string }[];
};

export async function loader({ context }: LoaderFunctionArgs) {
  const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
  const apiKey = env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return json({ models: [], error: 'ANTHROPIC_API_KEY is not set' }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!response.ok) {
      throw new Error(`Anthropic API returned ${response.status}`);
    }

    const data = await response.json() as AnthropicModelsResponse;
    const models = (data.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => Boolean(id))
      .sort();

    return json({ models });
  } catch (error) {
    logger.error('Anthropic model list fetch error:', error);
    return json({ models: [], error: 'Failed to fetch Anthropic models' }, { status: 500 });
  }
}
