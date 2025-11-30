import { redirect } from '@remix-run/cloudflare';
import { getCurrentUser, getLoginUrl } from './auth/session.server';

export async function requireAuth(request: Request) {
  const user = await getCurrentUser(request);
  
  if (!user) {
    const url = new URL(request.url);
    throw redirect(getLoginUrl(url.pathname + url.search));
  }
  
  return user;
}
