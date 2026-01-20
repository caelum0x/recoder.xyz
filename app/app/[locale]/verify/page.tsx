/**
 * Verification Code Page
 * Handles email verification via 6-digit codes
 *
 * URL: /verify?code=123456
 */

'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

// Icon components (UnoCSS compatible)
const ArrowLeft = ({ className }: { className?: string }) => <div className={`i-ph:arrow-left ${className || ''}`} />;
const Terminal = ({ className }: { className?: string }) => <div className={`i-ph:terminal ${className || ''}`} />;
const CheckCircle = ({ className }: { className?: string }) => <div className={`i-ph:check-circle-fill ${className || ''}`} />;
const XCircle = ({ className }: { className?: string }) => <div className={`i-ph:x-circle-fill ${className || ''}`} />;
const Loader = ({ className }: { className?: string }) => <div className={`i-ph:spinner ${className || ''} animate-spin`} />;
const ShieldCheck = ({ className }: { className?: string }) => <div className={`i-ph:shield-check ${className || ''}`} />;

function VerifyCodeContent() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [status, setStatus] = useState<'input' | 'verifying' | 'success' | 'error'>('input');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Check for code in URL on mount
  useEffect(() => {
    const urlCode = searchParams.get('code');
    const urlEmail = searchParams.get('email');

    if (urlEmail) {
      setEmail(urlEmail);
    }

    if (urlCode && urlCode.length === 6) {
      const codeArray = urlCode.split('');
      setCode(codeArray);
      // Auto-verify if code is in URL
      verifyCode(urlCode);
    }
  }, [searchParams]);

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all 6 digits entered
    if (value && index === 5 && newCode.every(d => d !== '')) {
      verifyCode(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      const codeArray = pastedData.split('');
      setCode(codeArray);
      verifyCode(pastedData);
    }
  };

  const verifyCode = async (verificationCode: string) => {
    setStatus('verifying');
    setMessage('');

    try {
      const response = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: verificationCode,
          email: email || undefined
        }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus('success');
        setMessage('Your email has been verified successfully!');

        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
      } else {
        setStatus('error');
        setMessage(data.error || 'Invalid or expired verification code.');
      }
    } catch (error) {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  const handleRetry = () => {
    setStatus('input');
    setCode(['', '', '', '', '', '']);
    setMessage('');
    inputRefs.current[0]?.focus();
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

            {/* Input State */}
            {status === 'input' && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center">
                      <ShieldCheck className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <h1 className="text-2xl font-bold">Enter Verification Code</h1>
                  <p className="text-gray-400">
                    Enter the 6-digit code sent to your email
                  </p>
                </div>

                {email && (
                  <div className="text-center text-sm text-gray-400">
                    Sent to: <span className="text-orange-400">{email}</span>
                  </div>
                )}

                {/* Code Input Boxes */}
                <div className="flex justify-center gap-2" onPaste={handlePaste}>
                  {code.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-12 h-14 text-center text-2xl font-bold bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white"
                      autoFocus={index === 0}
                    />
                  ))}
                </div>

                {message && (
                  <div className="p-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                    {message}
                  </div>
                )}

                <div className="space-y-3 text-center">
                  <p className="text-sm text-gray-400">
                    Didn't receive the code?{' '}
                    <Link href="/auth/verify-email" className="text-orange-500 hover:text-orange-400">
                      Resend Email
                    </Link>
                  </p>
                </div>
              </div>
            )}

            {/* Verifying State */}
            {status === 'verifying' && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center">
                    <Loader className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold">Verifying Code</h1>
                  <p className="text-gray-400">
                    Please wait while we verify your code...
                  </p>
                </div>
              </div>
            )}

            {/* Success State */}
            {status === 'success' && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-green-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-green-500">Email Verified!</h1>
                  <p className="text-gray-400">{message}</p>
                </div>
                <div className="space-y-3">
                  <Link
                    href="/dashboard"
                    className="block w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all text-center"
                  >
                    Go to Dashboard
                  </Link>
                  <p className="text-sm text-gray-400">
                    Redirecting automatically...
                  </p>
                </div>
              </div>
            )}

            {/* Error State */}
            {status === 'error' && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                    <XCircle className="w-10 h-10 text-red-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-red-500">Verification Failed</h1>
                  <p className="text-gray-400">{message}</p>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={handleRetry}
                    className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
                  >
                    Try Again
                  </button>
                  <Link
                    href="/auth/verify-email"
                    className="block w-full px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all text-center"
                  >
                    Request New Code
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Help Section */}
          <div className="mt-6 p-4 rounded-lg bg-white/5 border border-white/10">
            <p className="text-sm text-gray-400 text-center">
              Having trouble?{' '}
              <Link href="/support" className="text-orange-500 hover:text-orange-400">
                Contact Support
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <VerifyCodeContent />
    </Suspense>
  );
}
