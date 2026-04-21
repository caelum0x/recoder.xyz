import { redirect, type LoaderFunctionArgs } from '@remix-run/cloudflare';

function getMainSiteUrl(request: Request, env?: Record<string, string>): string {
  if (env?.MAIN_SITE_URL) {
    return env.MAIN_SITE_URL;
  }

  const url = new URL(request.url);

  if (url.hostname === 'web.recoder.xyz' || url.hostname === 'recoder.xyz') {
    return 'https://recoder.xyz';
  }

  return 'http://localhost:3000';
}

export function loader({ request, context }: LoaderFunctionArgs) {
  const env = (context as unknown as { cloudflare?: { env?: Record<string, string> } } | undefined)?.cloudflare?.env;
  return redirect(`${getMainSiteUrl(request, env)}/settings/account`);
}

export default function SettingsLayout() {
  return null;
}
