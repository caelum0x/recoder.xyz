import { useMutation, useQuery } from '@tanstack/react-query';
import {
  processImage,
  mergeImages,
  generateImages,
  convertToSvg,
  performOCR,
  getCanvasAIHealth,
  type ImageEditRequest,
  type ImageMergeRequest,
  type ImageGenerateRequest,
  type ConvertToSvgRequest,
  type OCRRequest,
} from '@/lib/api/canvas-ai';
import { toast } from '@/lib/toast';

export function useCanvasAIHealth() {
  return useQuery({
    queryKey: ['canvas-ai', 'health'],
    queryFn: getCanvasAIHealth,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useProcessImage() {
  return useMutation({
    mutationFn: (request: ImageEditRequest) => processImage(request),
    onError: (error: Error) => {
      toast.error(error.message || 'Image processing failed');
    },
  });
}

export function useMergeImages() {
  return useMutation({
    mutationFn: (request: ImageMergeRequest) => mergeImages(request),
    onError: (error: Error) => {
      toast.error(error.message || 'Image merge failed');
    },
  });
}

export function useGenerateImages() {
  return useMutation({
    mutationFn: (request: ImageGenerateRequest) => generateImages(request),
    onError: (error: Error) => {
      toast.error(error.message || 'Image generation failed');
    },
  });
}

export function useConvertToSvg() {
  return useMutation({
    mutationFn: (request: ConvertToSvgRequest) => convertToSvg(request),
    onError: (error: Error) => {
      toast.error(error.message || 'SVG conversion failed');
    },
  });
}

export function usePerformOCR() {
  return useMutation({
    mutationFn: (request: OCRRequest) => performOCR(request),
    onError: (error: Error) => {
      toast.error(error.message || 'OCR failed');
    },
  });
}
