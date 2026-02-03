/**
 * Get Generated Image
 * Functions for retrieving generated images
 */

import type {
  GenerationContextConfig,
  GenerationId,
} from './types';
import { getGeneration, getGeneratedImage as getGeneratedImageFromStorage } from './storage';
import { detectImageType } from './utils';

// =============================================================================
// Get Generated Image
// =============================================================================

/**
 * Gets a generated image file from a completed generation
 */
export async function getGeneratedImage(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
  filename: string;
}): Promise<File> {
  const { context, generationId, filename } = params;

  // Verify generation is completed
  const generation = await getGeneration({
    storage: context.storage,
    generationId,
  });

  if (generation?.status !== 'completed') {
    throw new Error(`Generation ${generationId} is not completed (status: ${generation?.status})`);
  }

  // Get the image data
  const generatedImage = await getGeneratedImageFromStorage({
    storage: context.storage,
    generationId,
    filename,
  });

  // Detect the image type
  const imageType = detectImageType(generatedImage);
  if (imageType === null) {
    throw new Error(`Could not detect image type for file: ${filename}`);
  }

  // Return as a File object (use ArrayBuffer.prototype.slice for compatibility)
  const arrayBuffer = new ArrayBuffer(generatedImage.byteLength);
  new Uint8Array(arrayBuffer).set(generatedImage);
  return new File([arrayBuffer], filename, {
    type: imageType.contentType,
  });
}

// =============================================================================
// Get Generated Image as Blob
// =============================================================================

/**
 * Gets a generated image as a Blob
 */
export async function getGeneratedImageBlob(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
  filename: string;
}): Promise<Blob> {
  const { context, generationId, filename } = params;

  // Get the image data
  const generatedImage = await getGeneratedImageFromStorage({
    storage: context.storage,
    generationId,
    filename,
  });

  // Detect the image type
  const imageType = detectImageType(generatedImage);
  if (imageType === null) {
    throw new Error(`Could not detect image type for file: ${filename}`);
  }

  const arrayBuffer = new ArrayBuffer(generatedImage.byteLength);
  new Uint8Array(arrayBuffer).set(generatedImage);
  return new Blob([arrayBuffer], { type: imageType.contentType });
}

// =============================================================================
// Get Generated Image as Data URL
// =============================================================================

/**
 * Gets a generated image as a base64 data URL
 */
export async function getGeneratedImageDataUrl(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
  filename: string;
}): Promise<string> {
  const { context, generationId, filename } = params;

  // Get the image data
  const generatedImage = await getGeneratedImageFromStorage({
    storage: context.storage,
    generationId,
    filename,
  });

  // Detect the image type
  const imageType = detectImageType(generatedImage);
  if (imageType === null) {
    throw new Error(`Could not detect image type for file: ${filename}`);
  }

  // Convert to base64
  const base64 = btoa(Array.from(generatedImage).map(b => String.fromCharCode(b)).join(''));
  return `data:${imageType.contentType};base64,${base64}`;
}

// =============================================================================
// Get All Generated Images
// =============================================================================

/**
 * Gets all generated images from a completed generation
 */
export async function getAllGeneratedImages(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
}): Promise<Array<{ filename: string; file: File; contentType: string }>> {
  const { context, generationId } = params;

  // Get the generation
  const generation = await getGeneration({
    storage: context.storage,
    generationId,
  });

  if (generation?.status !== 'completed') {
    throw new Error(`Generation ${generationId} is not completed (status: ${generation?.status})`);
  }

  // Find all generated image outputs
  const imageOutputs = generation.outputs.filter((output) => output.type === 'generated-image');

  const images: Array<{ filename: string; file: File; contentType: string }> = [];

  for (const output of imageOutputs) {
    if (!output.contents) continue;

    for (const content of output.contents) {
      const file = await getGeneratedImage({
        context,
        generationId,
        filename: content.filename,
      });

      images.push({
        filename: content.filename,
        file,
        contentType: content.contentType,
      });
    }
  }

  return images;
}

// =============================================================================
// Check if Image Exists
// =============================================================================

/**
 * Checks if a generated image exists
 */
export async function generatedImageExists(params: {
  context: GenerationContextConfig;
  generationId: GenerationId;
  filename: string;
}): Promise<boolean> {
  const { context, generationId, filename } = params;

  const path = `generations/${generationId}/generated-images/${filename}`;
  return context.storage.exists(path);
}
