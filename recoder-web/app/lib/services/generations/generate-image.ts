/**
 * Generate Image
 * Image generation using FAL AI, OpenAI DALL-E, and Google Imagen
 */

import type {
  FailedGeneration,
  GenerationContextConfig,
  GenerationOutput,
  Image,
  ModelMessage,
  QueuedGeneration,
  RunningGeneration,
} from './types';
import { ImageIdGenerator } from './types';
import { useGenerationExecutor } from './internal/use-generation-executor';
import { buildMessageObject, detectImageType } from './utils';
import { setGeneratedImage } from './storage';

// =============================================================================
// Types
// =============================================================================

export interface GenerateImageParams {
  context: GenerationContextConfig;
  generation: QueuedGeneration;
  signal?: AbortSignal;
}

export interface GeneratedImageData {
  uint8Array: Uint8Array;
  base64: string;
}

interface ImageGenerationConfig {
  n?: number;
  size?: string;
  quality?: string;
  style?: string;
}

// =============================================================================
// FAL AI Image Generation
// =============================================================================

async function generateImageWithFal(params: {
  model: string;
  prompt: string;
  config: ImageGenerationConfig;
  signal?: AbortSignal;
}): Promise<GeneratedImageData[]> {
  const { model, prompt, config, signal } = params;

  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) {
    throw new Error('FAL_API_KEY environment variable is not set');
  }

  // Map model ID to FAL endpoint
  const endpoint = model.includes('flux') ? 'fal-ai/flux/schnell' : 'fal-ai/fast-sdxl';

  const response = await fetch(`https://fal.run/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      num_images: config.n ?? 1,
      image_size: config.size ?? 'square_hd',
      enable_safety_checker: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FAL API error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as Record<string, any>;
  const images: GeneratedImageData[] = [];

  for (const image of result.images || []) {
    // FAL returns URLs, we need to fetch the actual image data
    const imageResponse = await fetch(image.url);
    const arrayBuffer = await imageResponse.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const base64 = btoa(Array.from(uint8Array).map(b => String.fromCharCode(b)).join(''));

    images.push({ uint8Array, base64 });
  }

  return images;
}

// =============================================================================
// OpenAI DALL-E Image Generation
// =============================================================================

async function generateImageWithOpenAI(params: {
  prompt: string;
  config: ImageGenerationConfig;
  signal?: AbortSignal;
}): Promise<GeneratedImageData[]> {
  const { prompt, config, signal } = params;

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: config.n ?? 1,
      size: config.size ?? '1024x1024',
      quality: config.quality ?? 'standard',
      response_format: 'b64_json',
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as Record<string, any>;
  const images: GeneratedImageData[] = [];

  for (const image of result.data || []) {
    const base64 = image.b64_json;
    const binary = atob(base64);
    const uint8Array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      uint8Array[i] = binary.charCodeAt(i);
    }
    images.push({ uint8Array, base64 });
  }

  return images;
}

// =============================================================================
// Google Imagen Image Generation
// =============================================================================

async function generateImageWithGoogle(params: {
  model: string;
  prompt: string;
  config: ImageGenerationConfig;
  signal?: AbortSignal;
}): Promise<GeneratedImageData[]> {
  const { model, prompt, config, signal } = params;

  const googleApiKey = process.env.GOOGLE_API_KEY;
  if (!googleApiKey) {
    throw new Error('GOOGLE_API_KEY environment variable is not set');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ['image'],
          responseMimeType: 'image/png',
        },
      }),
      signal,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google API error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as Record<string, any>;
  const images: GeneratedImageData[] = [];

  // Extract images from response
  const candidates = result.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const base64 = part.inlineData.data;
        const binary = atob(base64);
        const uint8Array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          uint8Array[i] = binary.charCodeAt(i);
        }
        images.push({ uint8Array, base64 });
      }
    }
  }

  return images;
}

// =============================================================================
// Main Generate Image Function
// =============================================================================

export async function generateImage(params: GenerateImageParams): Promise<void> {
  const { context, generation, signal } = params;

  return useGenerationExecutor({
    context,
    generation,
    signal,
    execute: async ({
      runningGeneration,
      generationContext,
      fileResolver,
      generationContentResolver,
      imageGenerationResolver,
      finishGeneration,
      setGeneration,
    }) => {
      try {
        const operationNode = generationContext.operationNode;

        if (operationNode.content.type !== 'imageGeneration') {
          throw new Error('Invalid generation type - expected imageGeneration');
        }

        // Build messages to extract prompt
        const messages = await buildMessageObject({
          node: operationNode,
          contextNodes: generationContext.sourceNodes,
          fileResolver,
          generationContentResolver,
          imageGenerationResolver,
        });

        // Extract prompt from messages
        let prompt = '';
        for (const message of messages) {
          if (!Array.isArray(message.content)) continue;
          for (const content of message.content) {
            if (content.type === 'text' && content.text) {
              prompt += content.text;
            }
          }
        }

        if (!prompt) {
          throw new Error('No prompt found for image generation');
        }

        const llm = operationNode.content.llm;
        if (!llm) {
          throw new Error('No language model configured for image generation');
        }

        const config: ImageGenerationConfig = {
          n: (llm.configurations as { n?: number }).n ?? 1,
          size: (llm.configurations as { size?: string }).size,
          quality: (llm.configurations as { quality?: string }).quality,
        };

        // Generate images based on provider
        let generatedImages: GeneratedImageData[];

        switch (llm.provider) {
          case 'fal':
            generatedImages = await generateImageWithFal({
              model: llm.id,
              prompt,
              config,
              signal,
            });
            break;

          case 'openai':
            generatedImages = await generateImageWithOpenAI({
              prompt,
              config,
              signal,
            });
            break;

          case 'google':
            generatedImages = await generateImageWithGoogle({
              model: llm.id,
              prompt,
              config,
              signal,
            });
            break;

          default:
            throw new Error(`Unsupported image generation provider: ${llm.provider}`);
        }

        // Process and store generated images
        const generationOutputs: GenerationOutput[] = [];

        const generatedImageOutput = generationContext.operationNode.outputs.find(
          (output) => output.accessor === 'generated-image',
        );

        if (generatedImageOutput !== undefined) {
          const contents: Image[] = [];

          for (const generatedImage of generatedImages) {
            const imageType = detectImageType(generatedImage.uint8Array);
            if (imageType === null) {
              context.logger.warn('Could not detect image type, skipping');
              continue;
            }

            const id = ImageIdGenerator.generate();
            const filename = `${id}.${imageType.ext}`;

            // Store the generated image
            await setGeneratedImage({
              storage: context.storage,
              generationId: runningGeneration.id,
              filename,
              data: generatedImage.uint8Array,
            });

            contents.push({
              id,
              contentType: imageType.contentType,
              filename,
              pathname: `/generations/${runningGeneration.id}/generated-images/${filename}`,
            });
          }

          generationOutputs.push({
            type: 'generated-image',
            contents,
            outputId: generatedImageOutput.id,
          });
        }

        // Finish the generation
        await finishGeneration({
          inputMessages: messages,
          outputs: generationOutputs,
        });
      } catch (error) {
        // Handle abort
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        const failedGeneration: FailedGeneration = {
          ...runningGeneration,
          status: 'failed',
          failedAt: Date.now(),
          error: {
            name: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message : String(error),
            dump: error,
          },
        };

        await setGeneration(failedGeneration);
        throw error;
      }
    },
  });
}

// =============================================================================
// Utility: Generate Single Image (Simplified API)
// =============================================================================

export async function generateSingleImage(params: {
  provider: 'fal' | 'openai' | 'google';
  model?: string;
  prompt: string;
  size?: string;
  quality?: string;
}): Promise<GeneratedImageData> {
  const { provider, model, prompt, size, quality } = params;

  const config: ImageGenerationConfig = {
    n: 1,
    size,
    quality,
  };

  let images: GeneratedImageData[];

  switch (provider) {
    case 'fal':
      images = await generateImageWithFal({
        model: model || 'fal-ai/flux/schnell',
        prompt,
        config,
      });
      break;

    case 'openai':
      images = await generateImageWithOpenAI({
        prompt,
        config,
      });
      break;

    case 'google':
      images = await generateImageWithGoogle({
        model: model || 'imagen-3.0-generate-001',
        prompt,
        config,
      });
      break;

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  if (images.length === 0) {
    throw new Error('No images generated');
  }

  return images[0];
}
