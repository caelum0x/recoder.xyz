import { type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { JsonResponse } from '~/lib/http/json-response';
import { getGitHubIngestionStatus } from './api.github.documents';

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== 'GET') {
    return JsonResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  const session = await verifySession(request);
  if (!session?.user) {
    return JsonResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const url = new URL(request.url);
  const ingestionId = url.searchParams.get('ingestionId')?.trim();

  if (!ingestionId) {
    return JsonResponse.json({ success: false, error: 'ingestionId is required' }, { status: 400 });
  }

  const status = getGitHubIngestionStatus(ingestionId);
  if (!status || status.userId !== session.user.id) {
    return JsonResponse.json({ success: false, error: 'Ingestion not found' }, { status: 404 });
  }

  return JsonResponse.json({
    success: true,
    ingestion: {
      id: status.id,
      owner: status.owner,
      repo: status.repo,
      sourceType: status.sourceType,
      state: status.state,
      provider: status.provider,
      count: status.count,
      error: status.error,
      startedAt: status.startedAt,
      updatedAt: status.updatedAt,
      finishedAt: status.finishedAt,
    },
  });
}
