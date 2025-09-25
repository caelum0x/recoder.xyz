'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        // Get the current URL to extract any tokens or error info from hash or query params
        const urlParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash;
        
        // Check for error in URL
        const error = urlParams.get('error') || searchParams.get('error');
        const errorDescription = urlParams.get('error_description') || searchParams.get('error_description');
        
        if (error) {
          setStatus('error');
          setMessage(errorDescription || error);
          return;
        }

        // Check for success indicators - this would typically be handled by the backend
        // For now, we'll assume success and try to get user info from localStorage or make API call
        
        // If we get here from the backend OAuth flow, the backend should have set some indication
        // Let's try to get user info from the API
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        
        // Check if we have a session cookie or token
        const response = await fetch(`${backendUrl}/api/auth/me`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData.user);
          setStatus('success');
          setMessage('Successfully authenticated!');
          
          // Store tokens if provided
          if (userData.accessToken) {
            localStorage.setItem('accessToken', userData.accessToken);
          }
          if (userData.refreshToken) {
            localStorage.setItem('refreshToken', userData.refreshToken);
          }
          
          // Redirect to dashboard after short delay
          setTimeout(() => {
            router.push('/dashboard');
          }, 2000);
        } else {
          // Try to parse error from response
          const errorData = await response.json().catch(() => ({}));
          setStatus('error');
          setMessage(errorData.error || 'Authentication failed');
        }
      } catch (error) {
        console.error('OAuth callback error:', error);
        setStatus('error');
        setMessage('An unexpected error occurred during authentication');
      }
    };

    handleOAuthCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'loading' && (
            <div className="text-center space-y-4">
              <Icons.spinner className="h-8 w-8 animate-spin mx-auto" />
              <p>Completing authentication...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4">
              <div className="h-8 w-8 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <Icons.check className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-green-600 font-medium">{message}</p>
                {user && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Welcome, {user.name}! Redirecting to dashboard...
                  </p>
                )}
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <Icons.alertCircle className="h-4 w-4" />
                <AlertDescription>{message}</AlertDescription>
              </Alert>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => router.push('/auth/signin')}
                  className="flex-1"
                >
                  Try Again
                </Button>
                <Button 
                  onClick={() => router.push('/')}
                  className="flex-1"
                >
                  Go Home
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}