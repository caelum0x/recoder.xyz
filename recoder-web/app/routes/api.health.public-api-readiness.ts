import { type LoaderFunctionArgs } from '@remix-run/cloudflare';
import {
  DockerHttpError,
  createDockerProxyHeaders,
  dockerFetchJson,
  getDockerBackendUrl,
} from '~/lib/http/docker-server';
import { JsonResponse } from '~/lib/http/json-response';

type QueueHealthResponse = {
  status: string;
  queue?: {
    configuredBackend?: string;
    selectedBackend?: string;
    hasRedisUrl?: boolean;
    redisKeyPrefix?: string;
    sqlitePath?: string;
  };
  warnings?: string[];
};

type ByokReadinessResponse = {
  status: string;
  overallReady?: boolean;
  readiness?: {
    appApiUrlConfigured?: boolean;
    internalServiceKeyConfigured?: boolean;
    internalServiceKeyStrong?: boolean;
    queueConfigValid?: boolean;
  };
  requiredEnv?: string[];
  missing?: string[];
  warnings?: string[];
  queue?: {
    configuredBackend?: string;
    selectedBackend?: string;
    hasRedisUrl?: boolean;
  };
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const dockerUrl = getDockerBackendUrl(context);
  const headers = createDockerProxyHeaders(request);

  try {
    const [queue, byok] = await Promise.all([
      dockerFetchJson<QueueHealthResponse>(
        `${dockerUrl}/api/health/public-api-queue`,
        { method: 'GET' },
        headers,
      ),
      dockerFetchJson<ByokReadinessResponse>(
        `${dockerUrl}/api/health/byok-readiness`,
        { method: 'GET' },
        headers,
      ),
    ]);

    const overallReady = Boolean(byok.overallReady);
    return JsonResponse.json(
      {
        status: overallReady ? 'ready' : 'not_ready',
        overallReady,
        queue,
        byok,
      },
      { status: overallReady ? 200 : 503 },
    );
  } catch (error) {
    const dockerLikeStatus =
      error instanceof DockerHttpError
        ? error.status
        : typeof (error as { status?: unknown })?.status === 'number'
          ? ((error as { status: number }).status)
          : undefined;
    const dockerLikePayload =
      error instanceof DockerHttpError
        ? error.payload
        : (error as { payload?: unknown })?.payload;

    if (typeof dockerLikeStatus === 'number') {
      return JsonResponse.json(
        {
          status: 'error',
          error: error instanceof Error ? error.message : 'Docker backend request failed',
          upstreamStatus: dockerLikeStatus,
          upstreamPayload: dockerLikePayload,
        },
        { status: dockerLikeStatus >= 400 && dockerLikeStatus < 600 ? dockerLikeStatus : 502 },
      );
    }
    return JsonResponse.json(
      {
        status: 'error',
        error: 'Failed to fetch public API readiness',
      },
      { status: 500 },
    );
  }
}
