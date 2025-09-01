"use client";

// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useSearchParams, useRouter } from "next/navigation";
import { Check, AlertCircle, Smartphone, Monitor, Terminal, Code } from "lucide-react";

export default function DeviceAuthorizationPage() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [userCode, setUserCode] = useState(searchParams?.get('user_code') || '');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authResult, setAuthResult] = useState<'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!user && !loading) {
      // Redirect to sign in with return URL
      router.push(`/login?callbackUrl=${encodeURIComponent(window.location.href)}`);
    }
  }, [user, loading, router]);

  const handleAuthorizeDevice = async () => {
    if (!userCode.trim()) {
      setErrorMessage('Please enter a valid user code');
      return;
    }

    setIsAuthorizing(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/auth/device/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userCode: userCode.trim().toUpperCase() }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setAuthResult('success');
      } else {
        setAuthResult('error');
        setErrorMessage(result.error || 'Authorization failed');
      }
    } catch (error) {
      setAuthResult('error');
      setErrorMessage('Network error. Please try again.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const formatUserCode = (code: string) => {
    // Format as XXXX-XXXX for better readability
    const cleaned = code.replace(/[^A-Z0-9]/g, '').toUpperCase();
    return cleaned.length > 4 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}` : cleaned;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to sign in
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Smartphone className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Device Authorization</h2>
          <p className="mt-2 text-gray-600">
            Authorize a device to access your Recoder account
          </p>
        </div>

        {authResult === 'success' ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <Check className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold text-green-900 mb-2">
              Device Authorized Successfully!
            </h3>
            <p className="text-green-700 mb-4">
              Your device has been authorized and can now access your Recoder account.
            </p>
            <p className="text-sm text-green-600">
              You can close this window and return to your device.
            </p>
          </div>
        ) : authResult === 'error' ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold text-red-900 mb-2">
              Authorization Failed
            </h3>
            <p className="text-red-700 mb-4">{errorMessage}</p>
            <button
              onClick={() => {
                setAuthResult(null);
                setErrorMessage('');
              }}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg p-6">
            <div className="space-y-6">
              {/* User Info */}
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <img
                  src={user?.image || '/default-avatar.png'}
                  alt="Profile"
                  className="h-10 w-10 rounded-full"
                />
                <div>
                  <p className="font-medium text-gray-900">{user?.name}</p>
                  <p className="text-sm text-gray-600">{user?.email}</p>
                </div>
              </div>

              {/* Device Types Info */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">
                  This authorization will allow access from:
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Terminal className="h-6 w-6 text-gray-600 mx-auto mb-1" />
                    <span className="text-xs text-gray-600">CLI</span>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Code className="h-6 w-6 text-gray-600 mx-auto mb-1" />
                    <span className="text-xs text-gray-600">Extension</span>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Monitor className="h-6 w-6 text-gray-600 mx-auto mb-1" />
                    <span className="text-xs text-gray-600">Router</span>
                  </div>
                </div>
              </div>

              {/* User Code Input */}
              <div>
                <label htmlFor="userCode" className="block text-sm font-medium text-gray-700 mb-2">
                  Enter the code displayed on your device:
                </label>
                <input
                  id="userCode"
                  type="text"
                  value={userCode}
                  onChange={(e) => setUserCode(formatUserCode(e.target.value))}
                  placeholder="XXXX-XXXX"
                  maxLength={9}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-lg font-mono tracking-wider focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
                  style={{ letterSpacing: '0.2em' }}
                />
                {errorMessage && (
                  <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
                )}
              </div>

              {/* Permissions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Permissions</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Generate and run code</li>
                  <li>• Access your chat history</li>
                  <li>• Deploy applications</li>
                  <li>• Use AI models within your quota</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={handleAuthorizeDevice}
                  disabled={isAuthorizing || !userCode.trim()}
                  className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isAuthorizing ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Authorizing...
                    </div>
                  ) : (
                    'Authorize Device'
                  )}
                </button>
                
                <button
                  onClick={() => router.push('/dashboard')}
                  className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>

              {/* Security Note */}
              <div className="text-xs text-gray-500 text-center">
                <p>
                  Only authorize devices you trust. You can revoke access anytime in your{' '}
                  <a href="/settings" className="text-blue-600 hover:underline">
                    security settings
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const runtime = "edge";