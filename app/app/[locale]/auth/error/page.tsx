/**
 * Authentication Error Page
 * Displays friendly error messages for authentication failures
 */

'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, 
  Terminal,
  AlertCircle,
  XCircle,
  ShieldAlert,
  Clock,
  Mail
} from 'lucide-react';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const message = searchParams.get('message');
  const provider = searchParams.get('provider');

  // Error type mapping
  const getErrorDetails = () => {
    switch (error) {
      case 'Configuration':
        return {
          icon: ShieldAlert,
          title: 'Configuration Error',
          description: 'There is a problem with the server configuration. Please contact support.',
          color: 'red'
        };
      case 'AccessDenied':
        return {
          icon: XCircle,
          title: 'Access Denied',
          description: provider 
            ? `You cancelled the ${provider} authentication or did not grant the necessary permissions.`
            : 'Access was denied. Please try again.',
          color: 'orange'
        };
      case 'Verification':
        return {
          icon: Mail,
          title: 'Email Verification Required',
          description: 'Please verify your email address before signing in.',
          color: 'blue',
          action: {
            text: 'Resend Verification Email',
            href: '/auth/verify-email'
          }
        };
      case 'OAuthSignin':
      case 'OAuthCallback':
      case 'OAuthCreateAccount':
      case 'OAuthAccountNotLinked':
        return {
          icon: AlertCircle,
          title: provider ? `${provider} Sign-In Error` : 'OAuth Error',
          description: error === 'OAuthAccountNotLinked'
            ? 'This account is already associated with another sign-in method. Please use your original sign-in method.'
            : provider 
            ? `There was a problem signing in with ${provider}. Please try again or use a different method.`
            : 'There was a problem with OAuth authentication.',
          color: 'orange'
        };
      case 'EmailCreateAccount':
        return {
          icon: Mail,
          title: 'Account Creation Failed',
          description: 'Unable to create your account. This email might already be registered.',
          color: 'orange'
        };
      case 'EmailSignin':
        return {
          icon: Mail,
          title: 'Email Sign-In Error',
          description: 'Unable to send sign-in email. Please try again.',
          color: 'orange'
        };
      case 'CredentialsSignin':
        return {
          icon: XCircle,
          title: 'Invalid Credentials',
          description: 'The email or password you entered is incorrect. Please try again.',
          color: 'red'
        };
      case 'SessionRequired':
        return {
          icon: Clock,
          title: 'Session Expired',
          description: 'Your session has expired. Please sign in again.',
          color: 'orange',
          action: {
            text: 'Sign In',
            href: '/auth/signin'
          }
        };
      case 'Callback':
        return {
          icon: AlertCircle,
          title: 'Callback Error',
          description: 'There was a problem processing your authentication. Please try again.',
          color: 'orange'
        };
      default:
        return {
          icon: AlertCircle,
          title: 'Authentication Error',
          description: message || 'An unexpected error occurred during authentication. Please try again.',
          color: 'red'
        };
    }
  };

  const errorDetails = getErrorDetails();
  const ErrorIcon = errorDetails.icon;
  const iconColorClass = {
    red: 'bg-red-500/20 text-red-500',
    orange: 'bg-orange-500/20 text-orange-500',
    blue: 'bg-blue-500/20 text-blue-500'
  }[errorDetails.color];

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
              {/* Error Icon */}
              <div className="flex justify-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${iconColorClass}`}>
                  <ErrorIcon className="w-10 h-10" />
                </div>
              </div>

              {/* Error Details */}
              <div className="space-y-2">
                <h1 className="text-2xl font-bold">{errorDetails.title}</h1>
                <p className="text-gray-400">{errorDetails.description}</p>
                {message && message !== errorDetails.description && (
                  <p className="text-sm text-gray-500 mt-2 p-3 bg-white/5 rounded-lg border border-white/10">
                    {message}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-4">
                {errorDetails.action ? (
                  <Link
                    href={errorDetails.action.href}
                    className="block w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all text-center"
                  >
                    {errorDetails.action.text}
                  </Link>
                ) : (
                  <Link
                    href="/auth/signin"
                    className="block w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all text-center"
                  >
                    Try Again
                  </Link>
                )}
                
                <Link
                  href="/"
                  className="block w-full px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all text-center"
                >
                  Go to Home
                </Link>
              </div>
            </div>
          </div>

          {/* Help Card */}
          <div className="mt-6 space-y-4">
            {/* Alternative Methods */}
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="text-sm font-medium text-gray-300 mb-3">Try a different method:</p>
              <div className="space-y-2">
                <Link
                  href="/auth/signin"
                  className="block text-sm text-orange-500 hover:text-orange-400 transition-colors"
                >
                  → Sign in with Email & Password
                </Link>
                {error !== 'OAuthSignin' && error !== 'OAuthCallback' && (
                  <>
                    <Link
                      href="/auth/signin"
                      className="block text-sm text-orange-500 hover:text-orange-400 transition-colors"
                    >
                      → Sign in with GitHub
                    </Link>
                    <Link
                      href="/auth/signin"
                      className="block text-sm text-orange-500 hover:text-orange-400 transition-colors"
                    >
                      → Sign in with Google
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* Support */}
            <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <p className="text-sm text-orange-200">
                <strong>Still having trouble?</strong> Our support team is here to help.{' '}
                <Link href="/support" className="underline hover:text-orange-300">
                  Contact Support
                </Link>
              </p>
            </div>

            {/* Debug Info (only in development) */}
            {process.env.NODE_ENV === 'development' && (
              <div className="p-4 rounded-lg bg-gray-900 border border-gray-800">
                <p className="text-xs font-mono text-gray-500 mb-2">Debug Info:</p>
                <div className="text-xs font-mono text-gray-400 space-y-1">
                  <div>Error: {error || 'none'}</div>
                  <div>Provider: {provider || 'none'}</div>
                  <div>Message: {message || 'none'}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}
