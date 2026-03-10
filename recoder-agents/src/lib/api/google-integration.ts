import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

export interface AuthURLResponse {
  auth_url: string;
  message: string;
}

export interface ConvertToSlidesRequest {
  presentation_path: string;
  sandbox_url: string;
}

export interface ConvertToSlidesResponse {
  success: boolean;
  message: string;
  pptx_url?: string;
  google_slides_url?: string;
  google_slides_file_id?: string;
  is_api_enabled: boolean;
}

export interface ConvertToDocsRequest {
  doc_path: string;
  sandbox_url: string;
}

export interface ConvertToDocsResponse {
  success: boolean;
  message: string;
  docx_url?: string;
  google_docs_url?: string;
  google_docs_file_id?: string;
  is_api_enabled: boolean;
}

export async function getGoogleAuthUrl(returnUrl?: string): Promise<AuthURLResponse> {
  const params = returnUrl ? `?return_url=${encodeURIComponent(returnUrl)}` : '';
  const response = await backendApi.get<unknown>(`/google/auth-url${params}`, {
    showErrors: true,
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'get Google auth URL' });
    throw new Error(response.error.message || 'Failed to get Google auth URL');
  }

  return response.data as AuthURLResponse;
}

export async function convertToGoogleSlides(request: ConvertToSlidesRequest): Promise<ConvertToSlidesResponse> {
  const response = await backendApi.post<unknown>(
    '/presentation-tools/convert-and-upload-to-slides',
    request,
    { showErrors: true, timeout: 60000 }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'convert to Google Slides' });
    throw new Error(response.error.message || 'Failed to convert to Google Slides');
  }

  return response.data as ConvertToSlidesResponse;
}

export async function convertToGoogleDocs(request: ConvertToDocsRequest): Promise<ConvertToDocsResponse> {
  const response = await backendApi.post<unknown>(
    '/document-tools/convert-and-upload-to-docs',
    request,
    { showErrors: true, timeout: 60000 }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'convert to Google Docs' });
    throw new Error(response.error.message || 'Failed to convert to Google Docs');
  }

  return response.data as ConvertToDocsResponse;
}
