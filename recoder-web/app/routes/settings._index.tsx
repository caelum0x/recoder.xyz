import { redirect } from '@remix-run/cloudflare';
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mainSiteUrl = url.hostname === 'web.recoder.xyz' || url.hostname === 'recoder.xyz'
    ? 'https://recoder.xyz'
    : 'http://localhost:3000';

  return redirect(`${mainSiteUrl}/settings/account`);
}
