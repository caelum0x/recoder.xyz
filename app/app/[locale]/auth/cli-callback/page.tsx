'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/session-provider';
import { Terminal, CheckCircle, X } from 'lucide-react';

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
        
        setStatus('success');
        setMessage('Redirecting back to CLI...');
        
        setTimeout(() => {
          window.location.href = callbackUrl;
        }, 1500);
      } catch (error) {
        console.error('CLI callback error:', error);
        setStatus('error');
        setMessage('Failed to complete authentication');
      }
    };

    handleCallback();
  }, [searchParams, session]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-8">
        <div className="text-center space-y-6">
          {/* Logo */}
          <div className="flex items-center justify-center space-x-2 mb-8">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </div>

          {status === 'loading' && (
            <>
              <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <h2 className="text-2xl font-bold">Processing Authentication</h2>
              <p className="text-gray-400">Completing CLI authentication...</p>
            </>
          )}
          
          {status === 'success' && (
            <>
              <div className="w-12 h-12 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-green-400">Authentication Successful!</h2>
              <p className="text-gray-400">{message}</p>
              <p className="text-sm text-gray-500">This window will close automatically.</p>
            </>
          )}
          
          {status === 'error' && (
            <>
              <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto">
                <X className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-red-400">Authentication Failed</h2>
              <p className="text-gray-400">{message}</p>
              <div className="space-y-2 mt-4">
                <button 
                  onClick={() => window.location.href = '/auth/signin'}
                  className="w-full px-6 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                >
                  Try Again
                </button>
                <button 
                  onClick={() => window.close()}
                  className="w-full px-6 py-2 bg-[#222] hover:bg-[#333] rounded-lg transition-colors"
                >
                  Close Window
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
