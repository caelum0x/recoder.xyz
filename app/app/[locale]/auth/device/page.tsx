'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Terminal, CheckCircle, X, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

function DeviceAuthContent() {
  const searchParams = useSearchParams();
  const initialUserCode = searchParams.get('user_code') || '';
  
  const [userCode, setUserCode] = useState(initialUserCode);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const formatUserCode = (code: string) => {
    const cleaned = code.replace(/[^A-Z0-9]/g, '').toUpperCase();
    if (cleaned.length <= 4) return cleaned;
    return cleaned.slice(0, 4) + '-' + cleaned.slice(4, 8);
  };

  const handleUserCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatUserCode(e.target.value);
    setUserCode(formatted);
  };

  const handleAuthorize = async () => {
    if (!userCode || userCode.length < 8) {
      setStatus('error');
      setMessage('Please enter a valid 8-character device code');
      return;
    }

    setIsLoading(true);
    setStatus('idle');

    try {
      const response = await fetch('/api/auth/cli-internal/authorize-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_code: userCode.replace('-', ''),
          action: 'authorize'
        }),
      });

      const result = await response.json();

      if (result.success) {
        setStatus('success');
        setMessage('Device authorized successfully! You can now return to your CLI.');
      } else {
        setStatus('error');
        setMessage(result.error || 'Authorization failed. Please check your code and try again.');
      }
    } catch (error) {
      setStatus('error');
      setMessage('Authorization failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2 group text-white hover:text-orange-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Home</span>
          </Link>
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-6 py-24">
        <div className="max-w-md mx-auto">
          <div className="p-8 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="text-center space-y-6">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
                <Terminal className="w-6 h-6 text-white" />
              </div>
              
              <div>
                <h1 className="text-2xl font-bold mb-2">Authorize CLI Device</h1>
                <p className="text-gray-400">
                  Enter the code shown in your CLI to authorize access to your recoder.xyz account
                </p>
              </div>

              {status === 'success' ? (
                <div className="p-4 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 mx-auto mb-2" />
                  {message}
                </div>
              ) : status === 'error' ? (
                <div className="p-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <X className="w-5 h-5 mx-auto mb-2" />
                  {message}
                </div>
              ) : (
                <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Device Code
                      </label>
                      <input
                        type="text"
                        placeholder="XXXX-XXXX"
                        value={userCode}
                        onChange={handleUserCodeChange}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white text-center text-lg font-mono tracking-wider placeholder-gray-500"
                        maxLength={9}
                        disabled={isLoading}
                      />
                      <p className="text-xs text-gray-500 text-center mt-2">
                        Enter the 8-character code displayed in your CLI
                      </p>
                    </div>

                    <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                      <h3 className="font-semibold text-orange-400 mb-3 flex items-center gap-2">
                        <Terminal className="w-4 h-4" />
                        Permissions Requested
                      </h3>
                      <ul className="space-y-2 text-sm text-gray-300">
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-3 h-3 text-orange-500" />
                          Generate and manage code projects
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-3 h-3 text-orange-500" />
                          Access your account and subscription info
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-3 h-3 text-orange-500" />
                          Sync usage quota and analytics
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-3 h-3 text-orange-500" />
                          Enable cross-platform session management
                        </li>
                      </ul>
                    </div>

                    <div className="flex gap-3">
                      <button 
                        onClick={handleAuthorize}
                        disabled={isLoading || !userCode || userCode.length < 8}
                        className="flex-1 px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
                      >
                        {isLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Authorizing...</span>
                          </>
                        ) : (
                          'Authorize Device'
                        )}
                      </button>
                    </div>
                </div>
              )}

              <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-gray-500 text-center">
                    Only authorize this request if you initiated it from your CLI application.
                    This will allow the CLI to access your recoder.xyz account.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

export default function DeviceAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <DeviceAuthContent />
    </Suspense>
  );
}