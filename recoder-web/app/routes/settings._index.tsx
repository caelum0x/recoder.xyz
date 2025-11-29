/**
 * Settings Index - Redirect to Editor Settings
 */

import { redirect } from '@remix-run/cloudflare';
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ request }: LoaderFunctionArgs) {
  return redirect('/settings/editor');
}
