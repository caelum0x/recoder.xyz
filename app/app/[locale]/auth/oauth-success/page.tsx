'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function OAuthSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    const handleOAuth = async () => {
      try {
        const code = searchParams?.get('code');
        const error = searchParams?.get('error');
        const provider = searchParams?.get('state'); // We'll use state parameter to pass provider info

        if (error) {
          setStatus('error');
          setMessage('Authentication cancelled or failed');
          return;
        }

        if (!code) {
          setStatus('error');
          setMessage('No authorization code received');
          return;
        }

        // For now, create a mock successful login
        // In production, you'd exchange the code for tokens here
        const mockUser = {
          id: `${provider}-${Date.now()}`,
          name: `${provider} User`,
          email: `user@${provider === 'github' ? 'github.com' : 'gmail.com'}`,
          provider: provider || 'github'
        };

        // Post to our working login endpoint
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            oauth: true,
            provider: provider || 'github',
            user: mockUser
          }),
        });

        const data = await response.json();

        if (data.success) {
          localStorage.setItem('authToken', data.user.token);
          setStatus('success');
          setMessage('Authentication successful! Redirecting...');
          
          setTimeout(() => {
            router.push('/dashboard');
          }, 2000);
        } else {
          setStatus('error');
          setMessage('Authentication failed. Please try again.');
        }
      } catch (error) {
        console.error('OAuth handling error:', error);
        setStatus('error');
        setMessage('Authentication failed. Please try again.');
      }
    };

    handleOAuth();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {status === 'loading' && 'Processing...'}
            {status === 'success' && 'Success!'}
            {status === 'error' && 'Authentication Failed'}
          </CardTitle>
          <CardDescription>
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'loading' && (
            <div className="flex justify-center">
              <div className="w-8 h-8 animate-spin border-4 border-blue-600 border-t-transparent rounded-full"></div>
            </div>
          )}
          {status === 'success' && (
            <div className="text-center text-green-600">
              ✓ Redirecting to dashboard...
            </div>
          )}
          {status === 'error' && (
            <div className="text-center">
              <p className="text-red-600 mb-4">❌ {message}</p>
              <button 
                onClick={() => router.push('/auth/signin')}
                className="text-blue-600 hover:underline"
              >
                ← Back to Sign In
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function OAuthSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Processing...</CardTitle>
            <CardDescription>Please wait while we process your authentication.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <div className="w-8 h-8 animate-spin border-4 border-blue-600 border-t-transparent rounded-full"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    }>
      <OAuthSuccessContent />
    </Suspense>
  );
}