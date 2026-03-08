import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ request }: LoaderFunctionArgs) {
  const serviceKey = request.headers.get('x-internal-service-key');
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;

  if (!expectedKey || serviceKey !== expectedKey) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  return json({
    app: 'web',
    stats: {
      totalItems: 0,
      activeItems: 0,
      lastActivityAt: null,
    },
    recentActivity: [],
  });
}
