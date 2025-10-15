/**
 * Authentication Signin Page
 * Unified authentication for all Recoder.xyz platforms
 */

'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, 
  Github, 
  Mail,
  Terminal,
  Globe,
  MessageSquare,
  Code2,
  CheckCircle
} from 'lucide-react';

function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('return');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const data = await response.json();

      if (data.success) {
        // Store token for platform access
        localStorage.setItem('authToken', data.user.token);
        
        // Show success state
        setError(''); // Clear any previous errors
        setSuccess(true);
        
        // Redirect to return URL or dashboard
        const redirectTo = returnUrl || '/dashboard';
        
        // Add a brief delay to show success feedback
        setTimeout(() => {
          window.location.href = redirectTo;
        }, 1500);
      } else {
        setError(data.error || 'Authentication failed. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const platforms = [
    {
      name: 'CLI',
      description: 'Access from terminal',
      icon: Terminal,
      connected: false
    },
    {
      name: 'Web',
      description: 'Browser-based development',
      icon: Globe,
      connected: false
    },
    {
      name: 'Chat',
      description: 'AI conversation interface',
      icon: MessageSquare,
      connected: false
    },
    {
      name: 'Extension',
      description: 'VS Code integration',
      icon: Code2,
      connected: false
    }
  ];

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
          {/* Sign In Card */}
          <div className="mb-8 p-8 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="text-center space-y-3 mb-8">
              <h1 className="text-3xl font-bold">Welcome Back</h1>
              <p className="text-gray-400">
                Sign in to access recoder-code and recoder-web
              </p>
            </div>
            <div className="space-y-4">
              <form onSubmit={handleSignIn} className="space-y-4">
                {error && (
                  <div className="p-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="p-4 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg">
                    ✓ Authentication successful! Redirecting...
                  </div>
                )}
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                    Email
                  </label>
                  <input
                    id="email" 
                    type="email" 
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder-gray-500"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                      Password
                    </label>
                    <Link 
                      href="/auth/forgot-password"
                      className="text-sm text-orange-500 hover:text-orange-400 transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <input
                    id="password" 
                    type="password" 
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder-gray-500"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="flex items-center">
                  <input
                    id="rememberMe"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 bg-white/5 border border-white/10 rounded text-orange-500 focus:ring-2 focus:ring-orange-500"
                  />
                  <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-300">
                    Remember me for 30 days
                  </label>
                </div>
                <button 
                  className="w-full px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
                  type="submit" 
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Signing In...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-5 h-5" />
                      <span>Sign In with Email</span>
                    </>
                  )}
                </button>
              </form>
              
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-black text-gray-400">
                    Or continue with
                  </span>
                </div>
              </div>
              
              <button
                className="w-full px-6 py-3 border border-white/10 hover:border-white/20 hover:bg-white/5 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
                onClick={() => {
                  window.location.href = `https://github.com/login/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_GITHUB_ID || 'Ov23liVrw6X0xO8m2jPy'}&redirect_uri=${encodeURIComponent('https://recoder.xyz/auth/oauth-success')}&scope=user:email&state=github`;
                }}
              >
                <Github className="w-5 h-5" />
                <span>Continue with GitHub</span>
              </button>
              
              <button
                className="w-full px-6 py-3 border border-white/10 hover:border-white/20 hover:bg-white/5 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
                onClick={() => {
                  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '716966330476-q7khujpttocjrgl3qils6b5aegef93jj.apps.googleusercontent.com';
                  const redirectUri = encodeURIComponent('https://recoder.xyz/auth/oauth-success');
                  window.location.href = `https://accounts.google.com/oauth/authorize?client_id=${googleClientId}&redirect_uri=${redirectUri}&scope=openid%20email%20profile&response_type=code&state=google`;
                }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Continue with Google</span>
              </button>
              
              <div className="text-center text-sm pt-4">
                <span className="text-gray-400">Don't have an account? </span>
                <Link href="/auth/register" className="text-orange-500 hover:text-orange-400 transition-colors">
                  Sign up
                </Link>
              </div>
            </div>
          </div>

          {/* Platform Access Card */}
          <div className="p-8 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="space-y-4 mb-6">
              <h2 className="text-xl font-bold">One Account. All Platforms.</h2>
              <p className="text-gray-400 text-sm">
                Access recoder-code (CLI) and recoder-web with a single sign-in
              </p>
            </div>
            
            <div className="space-y-3">
              {platforms.map((platform, index) => {
                const Icon = platform.icon;
                return (
                  <div key={index} className="flex items-center justify-between p-4 rounded-lg border border-white/5 bg-white/5 hover:border-white/10 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-white">recoder-{platform.name.toLowerCase()}</div>
                        <div className="text-sm text-gray-400">{platform.description}</div>
                      </div>
                    </div>
                    {platform.connected ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className="w-2 h-2 bg-gray-600 rounded-full" />
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="mt-6 p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <div className="text-sm text-orange-200">
                <strong>CLI Authentication:</strong> After signing in, use{' '}
                <code className="bg-black/40 px-2 py-1 rounded text-xs text-orange-400">
                  recoder auth login
                </code>{' '}
                in your terminal
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}