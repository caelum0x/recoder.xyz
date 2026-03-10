import { requireSessionAccessToken } from '@/lib/auth/session-token';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export interface GenerateVoiceRequest {
  text: string;
  reference_audio?: string;
}

export interface GenerateVoiceResponse {
  audio_urls: string[];
}

/**
 * Generate voice audio from text. Returns URLs to audio chunks.
 *
 * Uses Bearer-token auth (requireSessionAccessToken) because the voice
 * backend expects an Authorization header, not session cookies.
 */
export async function generateVoice(request: GenerateVoiceRequest): Promise<GenerateVoiceResponse> {
  const token = await requireSessionAccessToken();

  const body = {
    text: request.text,
    reference_audio: request.reference_audio
      ?? process.env.NEXT_PUBLIC_VOICE_REFERENCE_AUDIO_URL
      ?? '/audio/marko.mp3',
  };

  const response = await fetch(`${API_URL}/voice/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorDetail = `Voice generation failed (${response.status})`;
    try {
      const errorData = await response.json();
      errorDetail = errorData.detail || errorData.message || errorDetail;
    } catch {
      const textError = await response.text().catch(() => '');
      if (textError) errorDetail = textError;
    }
    throw new Error(errorDetail);
  }

  const data = await response.json();

  if (!data.audio_urls || data.audio_urls.length === 0) {
    throw new Error('No audio URLs returned from server');
  }

  return { audio_urls: data.audio_urls };
}
