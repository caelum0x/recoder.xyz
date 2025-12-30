import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth-config';
import { headers } from 'next/headers';

export default async function WebPlatformPage() {
  // Get session server-side
  const session = await auth.api.getSession({
    headers: await headers()
  });

  // If no session, redirect to login
  if (!session) {
    redirect('/auth/signin?redirect=/platform/web');
  }

  // Redirect to web IDE - cookies are automatically shared via crossSubDomainCookies
  const webUrl = process.env.NODE_ENV === 'production' 
    ? 'https://web.recoder.xyz'
    : 'http://localhost:3009';
  
  redirect(webUrl);
}
