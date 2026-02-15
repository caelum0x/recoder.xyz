import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

function readEnv(
  context: LoaderFunctionArgs['context'],
  name: string,
): string {
  const cfEnv = (context as unknown as { cloudflare?: { env?: Record<string, string> } } | undefined)?.cloudflare?.env;
  return (cfEnv?.[name] || process.env[name] || '').trim();
}

export function loader({ context }: LoaderFunctionArgs) {
  const internalServiceKey = readEnv(context, 'INTERNAL_SERVICE_KEY');
  const mainSiteUrl = readEnv(context, 'MAIN_SITE_URL');
  const dockerBackendUrl = readEnv(context, 'DOCKER_BACKEND_URL');

  const readiness = {
    internalServiceKeyConfigured: Boolean(internalServiceKey),
    mainSiteUrlConfigured: Boolean(mainSiteUrl),
    dockerBackendUrlConfigured: Boolean(dockerBackendUrl),
  };

  const checks = {
    authVerifyBridgeConfigured:
      readiness.internalServiceKeyConfigured && readiness.mainSiteUrlConfigured,
    byokPromptTaskRouteConfigured:
      readiness.dockerBackendUrlConfigured,
  };

  const missing: string[] = [];
  if (!readiness.internalServiceKeyConfigured) missing.push('INTERNAL_SERVICE_KEY');
  if (!readiness.mainSiteUrlConfigured) missing.push('MAIN_SITE_URL');
  if (!readiness.dockerBackendUrlConfigured) missing.push('DOCKER_BACKEND_URL');

  const overallReady =
    checks.authVerifyBridgeConfigured && checks.byokPromptTaskRouteConfigured;

  return json(
    {
      status: overallReady ? 'ready' : 'not_ready',
      overallReady,
      readiness,
      checks,
      requiredEnv: ['INTERNAL_SERVICE_KEY', 'MAIN_SITE_URL', 'DOCKER_BACKEND_URL'],
      missing,
    },
    { status: overallReady ? 200 : 503 },
  );
}
