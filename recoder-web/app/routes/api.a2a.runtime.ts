import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getA2ARuntimeDiagnostics } from '~/lib/.server/a2a-gateway';

export async function loader(_args: LoaderFunctionArgs) {
  const diagnostics = await getA2ARuntimeDiagnostics();
  const status = diagnostics.ok === true ? 200 : 503;
  return new Response(JSON.stringify(diagnostics), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
