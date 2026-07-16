import { cache } from 'react';
import { getPayload } from 'payload';
import config from '@/payload.config';

export function isPayloadCmsEnabled(): boolean {
  return process.env.PAYLOAD_CMS_ENABLED === 'true';
}

export function logPayloadCmsError(context: string, error: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[payload-cms] ${context}`, error);
  }
}

export const getPayloadClient = cache(async () => {
  if (!isPayloadCmsEnabled()) {
    return null;
  }

  try {
    return await getPayload({ config });
  } catch (error) {
    logPayloadCmsError('initialization failed', error);
    return null;
  }
});
