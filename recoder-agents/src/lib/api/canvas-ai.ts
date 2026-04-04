import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

export interface ImageEditRequest {
  action: 'upscale' | 'remove_bg' | 'edit_text' | 'mark_edit';
  image_base64: string;
  prompt?: string;
}

export interface ImageEditResponse {
  success: boolean;
  image_base64?: string;
  error?: string;
  message?: string;
}

export interface ImageMergeRequest {
  images: string[];
  prompt: string;
}

export interface ImageMergeResponse {
  success: boolean;
  image?: string;
  error?: string;
}

export interface ImageGenerateRequest {
  prompt: string;
  num_images?: number;
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
}

export interface ImageGenerateResponse {
  success: boolean;
  images: string[];
  error?: string;
  message?: string;
  degraded?: boolean;
  provider?: string;
}

export interface ConvertToSvgRequest {
  image_base64: string;
  colormode?: string;
  mode?: string;
}

export interface ConvertToSvgResponse {
  success: boolean;
  svg?: string;
  error?: string;
}

export interface OCRTextLine {
  id: string;
  text: string;
  confidence: number;
  bbox: number[];
  polygon: number[][];
}

export interface OCRRequest {
  image_base64: string;
}

export interface OCRResponse {
  success: boolean;
  text?: string;
  text_lines: OCRTextLine[];
  image_size?: number[];
  error?: string;
}

export interface CanvasAIHealth {
  status: string;
  default_model: string;
  available_models: Record<string, unknown>;
  openrouter_configured: boolean;
  vtracer_available: boolean;
  replicate_configured: boolean;
}

export async function processImage(request: ImageEditRequest): Promise<ImageEditResponse> {
  const response = await backendApi.post<unknown>('/canvas-ai/process', request, {
    showErrors: true,
    timeout: 60000,
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'process image' });
    throw new Error(response.error.message || 'Failed to process image');
  }

  return response.data as ImageEditResponse;
}

export async function mergeImages(request: ImageMergeRequest): Promise<ImageMergeResponse> {
  const response = await backendApi.post<unknown>('/canvas-ai/merge', request, {
    showErrors: true,
    timeout: 60000,
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'merge images' });
    throw new Error(response.error.message || 'Failed to merge images');
  }

  return response.data as ImageMergeResponse;
}

export async function generateImages(request: ImageGenerateRequest): Promise<ImageGenerateResponse> {
  const response = await backendApi.post<unknown>('/canvas-ai/generate', request, {
    showErrors: true,
    timeout: 60000,
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'generate images' });
    throw new Error(response.error.message || 'Failed to generate images');
  }

  return response.data as ImageGenerateResponse;
}

export async function convertToSvg(request: ConvertToSvgRequest): Promise<ConvertToSvgResponse> {
  const response = await backendApi.post<unknown>('/canvas-ai/convert-svg', request, {
    showErrors: true,
    timeout: 60000,
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'convert to SVG' });
    throw new Error(response.error.message || 'Failed to convert to SVG');
  }

  return response.data as ConvertToSvgResponse;
}

export async function performOCR(request: OCRRequest): Promise<OCRResponse> {
  const response = await backendApi.post<unknown>('/canvas-ai/ocr', request, {
    showErrors: true,
    timeout: 60000,
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'perform OCR' });
    throw new Error(response.error.message || 'Failed to perform OCR');
  }

  return response.data as OCRResponse;
}

export async function getCanvasAIHealth(): Promise<CanvasAIHealth> {
  const response = await backendApi.get<unknown>('/canvas-ai/health', {
    showErrors: true,
  });

  if (response.error) {
    throw new Error(response.error.message || 'Canvas AI unavailable');
  }

  return response.data as CanvasAIHealth;
}
