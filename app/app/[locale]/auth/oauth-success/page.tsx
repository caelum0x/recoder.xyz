'use client';

/**
 * OAuth landing. Better Auth owns the real OAuth exchange (its handler at
 * /api/auth/[...all] runs the provider callback and sets the session cookie),
 * so this page NEVER mints a session itself — it only reads the real Better Auth
 * session and routes accordingly. If a session exists, go to the dashboard;
 * otherwise the sign-in didn't complete, so send the user back to sign in.
 *
 * (Historically this page fabricated a mock user from the `state` param and
 * stored a client token in localStorage — that was an auth bypass and is gone.)
 */

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/auth-client';

function OAuthSuccessContent() {
  const router = useRouter();
  const { data, isPending } = useSession();
  const authed = !!data?.user;

  useEffect(() => {
    if (isPending || !authed) return;
    const t = setTimeout(() => router.push('/dashboard'), 1200);
    return () => clearTimeout(t);
  }, [isPending, authed, router]);

  const status: 'loading' | 'success' | 'error' = isPending
    ? 'loading'
    : authed
      ? 'success'
      : 'error';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {status === 'loading' && 'Signing you in'}
            {status === 'success' && 'Signed in'}
            {status === 'error' && "Sign-in didn't complete"}
          </CardTitle>
          <CardDescription>
            {status === 'loading' && 'Confirming your session…'}
            {status === 'success' && 'Taking you to your dashboard…'}
            {status === 'error' &&
              'We couldn’t confirm your session. Please try signing in again.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === 'loading' && (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
          )}
          {status === 'success' && <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden />}
          {status === 'error' && (
            <>
              <XCircle className="h-8 w-8 text-destructive" aria-hidden />
              <button
                type="button"
                onClick={() => router.push('/auth/signin')}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Back to sign in
              </button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function OAuthSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Signing you in</CardTitle>
              <CardDescription>Confirming your session…</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
            </CardContent>
          </Card>
        </div>
      }
    >
      <OAuthSuccessContent />
    </Suspense>
  );
}
