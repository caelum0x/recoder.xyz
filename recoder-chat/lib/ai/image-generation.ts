/**
 * Image Generation Service
 * Supports Gemini 2.5 Flash Image, FLUX, Stable Diffusion, and more
 */

import { getModelById } from './model-registry';

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number; // number of images
}

export interface ImageGenerationResponse {
  images: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  model: string;
  created: number;
}

/**
 * Generate images using Gemini 2.5 Flash Image
 */
export async function generateWithGemini(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  const model = 'gemini-2.5-flash-preview-0514';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Generate an image: ${request.prompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 1,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Gemini image generation failed: ${JSON.stringify(error)}`);
  }

  const data = await response.json();

  // Extract image data from response
  const images = data.candidates?.map((candidate: any) => ({
    b64_json: candidate.content?.parts?.[0]?.inlineData?.data,
    revised_prompt: request.prompt,
  })) || [];

  return {
    images,
    model: 'gemini-2.5-flash-image',
    created: Date.now(),
  };
}

/**
 * Generate images using OpenRouter (FLUX, Stable Diffusion, etc.)
 */
export async function generateWithOpenRouter(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const modelId = request.model || 'black-forest-labs/flux-1.1-pro';
  const url = 'https://openrouter.ai/api/v1/images/generations';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3010',
      'X-Title': 'Recoder Chat',
    },
    body: JSON.stringify({
      model: modelId,
      prompt: request.prompt,
      n: request.n || 1,
      size: request.size || '1024x1024',
      quality: request.quality || 'standard',
      style: request.style || 'vivid',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenRouter image generation failed: ${JSON.stringify(error)}`);
  }

  const data = await response.json();

  return {
    images: data.data || [],
    model: modelId,
    created: data.created || Date.now(),
  };
}

/**
 * Main image generation function with automatic provider selection
 */
export async function generateImage(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  try {
    // Determine which provider to use
    const modelId = request.model || 'google/gemini-2.5-flash-image';
    const modelInfo = getModelById(modelId);

    if (!modelInfo) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    // Route to appropriate provider
    if (modelInfo.provider === 'google') {
      return await generateWithGemini(request);
    } else {
      return await generateWithOpenRouter(request);
    }
  } catch (error) {
    console.error('Image generation error:', error);
    throw error;
  }
}

/**
 * Convert base64 image to data URL
 */
export function base64ToDataUrl(base64: string, mimeType: string = 'image/png'): string {
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Save generated image (server-side)
 */
export async function saveGeneratedImage(
  imageData: string,
  userId: string,
  prompt: string
): Promise<string> {
  // TODO: Implement image storage (Vercel Blob, S3, etc.)
  // For now, return the data URL
  return base64ToDataUrl(imageData);
}
