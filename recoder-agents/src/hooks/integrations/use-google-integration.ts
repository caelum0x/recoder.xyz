import { useMutation } from '@tanstack/react-query';
import {
  getGoogleAuthUrl,
  convertToGoogleSlides,
  convertToGoogleDocs,
  type ConvertToSlidesRequest,
  type ConvertToDocsRequest,
} from '@/lib/api/google-integration';
import { toast } from '@/lib/toast';

export function useGoogleAuth() {
  return useMutation({
    mutationFn: async (returnUrl?: string) => {
      const { auth_url } = await getGoogleAuthUrl(returnUrl);
      window.open(auth_url, '_blank', 'noopener,noreferrer');
      return auth_url;
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start Google authentication');
    },
  });
}

export function useConvertToGoogleSlides() {
  return useMutation({
    mutationFn: (request: ConvertToSlidesRequest) => convertToGoogleSlides(request),
    onSuccess: (data) => {
      if (data.google_slides_url) {
        toast.success('Uploaded to Google Slides');
        window.open(data.google_slides_url, '_blank', 'noopener,noreferrer');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to export to Google Slides');
    },
  });
}

export function useConvertToGoogleDocs() {
  return useMutation({
    mutationFn: (request: ConvertToDocsRequest) => convertToGoogleDocs(request),
    onSuccess: (data) => {
      if (data.google_docs_url) {
        toast.success('Uploaded to Google Docs');
        window.open(data.google_docs_url, '_blank', 'noopener,noreferrer');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to export to Google Docs');
    },
  });
}
