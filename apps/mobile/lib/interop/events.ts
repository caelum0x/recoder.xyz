import { API_URL, getAuthToken } from '@/api/config';
import { log } from '@/lib/logger';

type InteropEventName =
  | 'delegated_task_visible'
  | 'delegated_task_status_changed'
  | 'delegated_task_activation';

export interface InteropEventPayload {
  event: InteropEventName;
  threadId: string;
  taskId?: string;
  status?: string;
  connector?: string;
  source?: string;
  traceId?: string;
  isStreaming?: boolean;
  timestamp?: string;
}

function resolveIngestUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_INTEROP_INGEST_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim();
  }
  return `${API_URL}/analytics/interop-events`;
}

export function emitInteropEvent(payload: InteropEventPayload): void {
  const ingestUrl = resolveIngestUrl();
  const body = {
    ...payload,
    sourceSurface: 'mobile',
    emittedAt: new Date().toISOString(),
  };

  log.log('[INTEROP]', body);

  void (async () => {
    try {
      const token = await getAuthToken();
      await fetch(ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      log.debug('[INTEROP] Event ingest failed:', error);
    }
  })();
}

