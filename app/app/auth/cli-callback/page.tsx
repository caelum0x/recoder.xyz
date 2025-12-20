'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/session-provider';
import { getMainSiteUrl } from '@/lib/config/platforms';

export default function CLICallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const redirectUri = searchParams.get('redirect_uri');

      if (!code || !state || !redirectUri) {
        setStatus('error');
        setMessage('Missing required parameters');
        return;
      }

      if (!session?.user) {
        setStatus('error');
        setMessage('User not authenticated. Please sign in first.');
        return;
      }

      try {
        // Store user info for the auth code
        const response = await fetch('/api/auth/cli-internal/set-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            code: code,
            user_id: session.user.id,
            user_email: session.user.email,
            user_name: session.user.name
          })
        });

        if (!response.ok) {
          throw new Error('Failed to store user info');
        }

        // Redirect back to CLI
        const params = new URLSearchParams({
          code: code,
          state: state
        });
        
        const callbackUrl = `${decodeURIComponent(redirectUri)}?${params.toString()}`;
        window.location.href = callbackUrl;
        
        setStatus('success');
        setMessage('Redirecting back to CLI...');
      } catch (error) {
        console.error('CLI callback error:', error);
        setStatus('error');
        setMessage('Failed to complete authentication');
      }
    };

    handleCallback();
  }, [searchParams, session]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
        <div className="text-4xl mb-4">🚀</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          CLI Authentication
        </h1>
        
        {status === 'loading' && (
          <div>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Completing authentication...</p>
          </div>
        )}
        
        {status === 'success' && (
          <div>
            <div className="text-green-500 text-4xl mb-4">✅</div>
            <p className="text-gray-600 mb-4">Authentication successful!</p>
            <p className="text-sm text-gray-500">{message}</p>
            <p className="text-xs text-gray-400 mt-2">You can close this window.</p>
          </div>
        )}
        
        {status === 'error' && (
          <div>
            <div className="text-red-500 text-4xl mb-4">❌</div>
            <p className="text-gray-600 mb-4">Authentication failed</p>
            <p className="text-sm text-gray-500 mb-4">{message}</p>
            <div className="space-y-2">
              <button 
                onClick={() => window.location.href = '/auth/signin'}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Try Again
              </button>
              <button 
                onClick={() => window.close()}
                className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Close Window
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
