import { resolvePublicAppUrl } from '@/lib/email';

export function resolveSafeCheckoutReturnUrl(
  returnUrl?: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const appUrl = resolvePublicAppUrl(env);
  const fallback = `${appUrl}/billing/success`;

  if (!returnUrl) return fallback;

  try {
    const parsed = new URL(returnUrl);
    const appOrigin = new URL(appUrl).origin;
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    if (!isHttp || parsed.origin !== appOrigin) {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}
