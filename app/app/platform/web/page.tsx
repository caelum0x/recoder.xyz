/**
 * Recoder Web Platform Access Page
 * Enhanced with cross-platform session synchronization
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Globe, 
  ArrowRight, 
  Loader2, 
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Users,
  Zap
} from 'lucide-react';
import { clientSessionSync, SessionData } from '@/lib/session-sync';

export default function WebPlatformPage() {
  const [status, setStatus] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'redirecting' | 'syncing' | 'error'>('checking');
  const [message, setMessage] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [sessionData, setSessionData] = useState<SessionData | null>(null);

  useEffect(() => {
    checkAuthAndRedirect();
  }, []);

  const checkAuthAndRedirect = async () => {
    try {
      setStatus('checking');
      setMessage('Checking authentication...');

      // First, check for synchronized session
      const syncStatus = await clientSessionSync.checkSyncStatus();
      
      if (syncStatus.synced && syncStatus.sessionData) {
        setSessionData(syncStatus.sessionData);
        setStatus('syncing');
        setMessage('Session synchronized! Redirecting to Recoder Web...');
        
        // Session is already synced, redirect directly
        const webUrl = process.env.NODE_ENV === 'production' 
          ? 'https://web.recoder.xyz'
          : 'http://localhost:3009';
        
        setTimeout(() => {
          window.location.href = `${webUrl}?synced=true&from=main`;
        }, 1500);
        return;
      }

      // Check traditional token-based auth
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        setStatus('unauthenticated');
        setMessage('Please sign in to access Recoder Web Platform');
        return;
      }

      setStatus('redirecting');
      setMessage('Authenticating with Recoder Web...');

      // Call platform access API
      const response = await fetch('/api/platform/access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          platform: 'web',
          redirect: window.location.origin
        })
      });

      const data = await response.json();

      if (data.success) {
        setRedirectUrl(data.accessUrl);
        setMessage('Setting up cross-platform session...');
        
        // Create session data for synchronization
        const sessionData: SessionData = {
          userId: data.user?.id || 'demo-user',
          email: data.user?.email || 'user@recoder.xyz',
          name: data.user?.name || data.user?.email || 'User',
          plan: data.user?.plan || 'free',
          expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
          domains: ['web.recoder.xyz', 'chat.recoder.xyz', 'recoder.xyz']
        };
        
        // Trigger cross-platform session sync
        setStatus('syncing');
        setMessage('Synchronizing session across platforms...');
        const syncSuccess = await clientSessionSync.triggerSync(sessionData);
        
        if (syncSuccess) {
          console.log('Session synchronized across platforms');
        }
        
        setMessage('Redirecting to Recoder Web Platform...');
        
        // Redirect to recoder-web with authentication token
        const webUrl = new URL(data.accessUrl || 'http://localhost:3009');
        webUrl.searchParams.set('token', data.token);
        webUrl.searchParams.set('from', 'main-site');
        webUrl.searchParams.set('synced', 'true');
        
        // Small delay for user feedback
        setTimeout(() => {
          window.location.href = webUrl.toString();
        }, 2000);
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to access platform');
      }

    } catch (error) {
      setStatus('error');
      setMessage('Network error. Please try again.');
      console.error('Platform access error:', error);
    }
  };

  const handleSignIn = () => {
    // Redirect to sign in with return URL
    window.location.href = `/auth/signin?return=${encodeURIComponent('/platform/web')}`;
  };

  const handleRetry = () => {
    setStatus('checking');
    checkAuthAndRedirect();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Home</span>
            </Link>
            <div className="flex items-center space-x-2">
              <Globe className="w-8 h-8 text-blue-600" />
              <span className="text-xl font-bold">Recoder Web</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Globe className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl">Recoder Web Platform</CardTitle>
              <CardDescription>
                AI-powered web development with real-time collaboration
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-6">
              
              {status === 'checking' && (
                <div className="space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                  <p className="text-slate-600">Checking authentication...</p>
                </div>
              )}

              {status === 'authenticated' && (
                <div className="space-y-3">
                  <CheckCircle className="w-8 h-8 mx-auto text-green-500" />
                  <p className="text-slate-600">Authentication successful!</p>
                </div>
              )}

              {status === 'syncing' && (
                <div className="space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600" />
                  <p className="text-slate-600">{message}</p>
                  {sessionData && (
                    <div className="flex items-center justify-center space-x-2 text-xs text-purple-600">
                      <Users className="w-3 h-3" />
                      <span>Session synchronized for {sessionData.name}</span>
                    </div>
                  )}
                </div>
              )}

              {status === 'redirecting' && (
                <div className="space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                  <p className="text-slate-600">{message}</p>
                  {redirectUrl && (
                    <p className="text-xs text-slate-500">
                      Redirecting to: {redirectUrl}
                    </p>
                  )}
                </div>
              )}

              {status === 'unauthenticated' && (
                <div className="space-y-4">
                  <AlertCircle className="w-8 h-8 mx-auto text-orange-500" />
                  <p className="text-slate-600">{message}</p>
                  <Button onClick={handleSignIn} className="w-full">
                    Sign In to Continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}

              {status === 'error' && (
                <div className="space-y-4">
                  <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
                  <p className="text-slate-600">{message}</p>
                  <div className="flex space-x-2">
                    <Button onClick={handleRetry} variant="outline" className="flex-1">
                      Try Again
                    </Button>
                    <Button onClick={handleSignIn} className="flex-1">
                      Sign In
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-left">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  Recoder Web Features
                </h4>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <li>• Real-time collaborative coding</li>
                  <li>• AI-powered code generation</li>
                  <li>• Template gallery and sharing</li>
                  <li>• Cross-platform session synchronization</li>
                  <li className="flex items-center">
                    <Zap className="w-3 h-3 mr-1" />
                    • Seamless platform switching
                  </li>
                </ul>
              </div>

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}