/**
 * Device Flow Authorization Page
 * Users visit this page to authorize CLI device flow authentication
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

function DeviceAuthContent() {
  const searchParams = useSearchParams();
  const initialUserCode = searchParams.get('user_code') || '';
  
  const [userCode, setUserCode] = useState(initialUserCode);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Format user code with dash
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
      // Find the device flow request by user code
      const response = await fetch('/api/auth/cli-internal/authorize-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

  const handleDeny = async () => {
    if (!userCode || userCode.length < 8) {
      setStatus('error');
      setMessage('Please enter a valid device code to deny');
      return;
    }

    setIsLoading(true);

    try {
      await fetch('/api/auth/cli-internal/authorize-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_code: userCode.replace('-', ''),
          action: 'deny'
        }),
      });

      setStatus('success');
      setMessage('Device authorization denied. You can close this page.');
    } catch (error) {
      setStatus('error');
      setMessage('Failed to deny authorization. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">🚀</span>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Authorize CLI Device
          </CardTitle>
          <CardDescription className="text-gray-600">
            Enter the code shown in your CLI to authorize access to your recoder.xyz account
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {status === 'success' ? (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {message}
              </AlertDescription>
            </Alert>
          ) : status === 'error' ? (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {message}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="userCode" className="text-sm font-medium text-gray-700">
                  Device Code
                </label>
                <Input
                  id="userCode"
                  type="text"
                  placeholder="XXXX-XXXX"
                  value={userCode}
                  onChange={handleUserCodeChange}
                  className="text-center text-lg font-mono tracking-wider"
                  maxLength={9}
                  disabled={isLoading}
                />
                <p className="text-xs text-gray-500 text-center">
                  Enter the 8-character code displayed in your CLI
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <span className="text-blue-600">🔐</span>
                  Permissions Requested
                </h3>
                <ul className="space-y-1 text-sm text-blue-800">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-blue-600" />
                    Generate and manage code projects
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-blue-600" />
                    Access your account and subscription info
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-blue-600" />
                    Sync usage quota and analytics
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-blue-600" />
                    Enable cross-platform session management
                  </li>
                </ul>
              </div>

              <div className="flex gap-3">
                <Button 
                  onClick={handleAuthorize}
                  disabled={isLoading || !userCode || userCode.length < 8}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Authorizing...
                    </>
                  ) : (
                    'Authorize Device'
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleDeny}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Deny Access
                </Button>
              </div>
            </>
          )}

          <div className="border-t pt-4">
            <p className="text-xs text-gray-500 text-center">
              Only authorize this request if you initiated it from your CLI application.
              This will allow the CLI to access your recoder.xyz account.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DeviceAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </CardContent>
        </Card>
      </div>
    }>
      <DeviceAuthContent />
    </Suspense>
  );
}