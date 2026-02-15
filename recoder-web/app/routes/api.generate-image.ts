import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GenerateImage');

/**
 * POST /api/generate-image
 * Generate an image using OpenRouter's image models
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { prompt, width = 1024, height = 1024 } = await request.json() as {
      prompt: string;
      width?: number;
      height?: number;
    };

    if (!prompt) {
      return json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Get user's API key
    const { getAPIKey } = await import('~/lib/.server/llm/api-key');
    const apiKey = await getAPIKey((context as any)?.cloudflare?.env || process.env, request, 'openrouter');

    if (!apiKey) {
      return json({ error: 'No OpenRouter API key configured' }, { status: 401 });
    }

    // Use OpenRouter to generate image via DALL-E or Stable Diffusion
    const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://recoder.xyz',
        'X-Title': 'Recoder.xyz',
      },
      body: JSON.stringify({
        model: 'openai/dall-e-3', // or 'stabilityai/stable-diffusion-xl'
        prompt,
        n: 1,
        size: `${width}x${height}`,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('[generate-image] OpenRouter error:', error);
      return json({ error: 'Image generation failed' }, { status: 500 });
    }

    const data = await response.json() as {
      data?: Array<{
        url?: string;
        b64_json?: string;
      }>;
    };

    // OpenRouter returns { data: [{ url: "..." }] }
    const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;

    if (!imageUrl) {
      return json({ error: 'No image returned' }, { status: 500 });
    }

    return json({
      success: true,
      imageUrl,
      isBase64: !!data.data?.[0]?.b64_json
    });
  } catch (error) {
    logger.error('[generate-image] Error:', error);
    return json({ error: 'Image generation failed' }, { status: 500 });
  }
}
