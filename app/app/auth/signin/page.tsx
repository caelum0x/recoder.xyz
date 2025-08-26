/**
 * Authentication Signin Page
 * Unified authentication for all Recoder.xyz platforms
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Code2, 
  ArrowLeft, 
  Github, 
  Mail,
  Terminal,
  Globe,
  MessageSquare,
  CheckCircle
} from 'lucide-react';

function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        body: JSON.stringify({ email, password }),
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
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Code2 className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Recoder.xyz
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto">
          {/* Sign In Card */}
          <Card className="mb-8">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Sign in to Recoder</CardTitle>
              <CardDescription>
                One account for all platforms - CLI, Web, Chat, and Extensions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleSignIn} className="space-y-4">
                {error && (
                  <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded">
                    ✓ Authentication successful! Redirecting to dashboard...
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="your@email.com"
                    className="w-full"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••"
                    className="w-full"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button className="w-full" size="lg" type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <div className="w-4 h-4 mr-2 animate-spin border-2 border-white border-t-transparent rounded-full" />
                      Signing In...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Sign In with Email
                    </>
                  )}
                </Button>
              </form>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>
              
              <Button 
                variant="outline" 
                className="w-full" 
                size="lg" 
                onClick={() => {
                  window.location.href = `https://github.com/login/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_GITHUB_ID || 'Ov23liVrw6X0xO8m2jPy'}&redirect_uri=${encodeURIComponent('https://recoder.xyz/auth/oauth-success')}&scope=user:email&state=github`;
                }}
              >
                <Github className="w-4 h-4 mr-2" />
                Continue with GitHub
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full" 
                size="lg" 
                onClick={() => {
                  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '716966330476-q7khujpttocjrgl3qils6b5aegef93jj.apps.googleusercontent.com';
                  const redirectUri = encodeURIComponent('https://recoder.xyz/auth/oauth-success');
                  window.location.href = `https://accounts.google.com/oauth/authorize?client_id=${googleClientId}&redirect_uri=${redirectUri}&scope=openid%20email%20profile&response_type=code&state=google`;
                }}
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>
              
              <div className="text-center text-sm">
                <span className="text-muted-foreground">Don't have an account? </span>
                <Link href="/auth/register" className="text-blue-600 hover:underline">
                  Sign up
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Platform Access Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Platform Access</CardTitle>
              <CardDescription>
                Connect to any Recoder platform with a single account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {platforms.map((platform, index) => {
                  const Icon = platform.icon;
                  return (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="font-medium">Recoder {platform.name}</div>
                          <div className="text-sm text-muted-foreground">{platform.description}</div>
                        </div>
                      </div>
                      {platform.connected ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <div className="w-2 h-2 bg-gray-300 rounded-full" />
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>CLI Authentication:</strong> After signing in, use{' '}
                  <code className="bg-blue-100 dark:bg-blue-800 px-1 py-0.5 rounded text-xs">
                    recoder auth login
                  </code>{' '}
                  to connect your terminal.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
    </div>}>
      <SignInForm />
    </Suspense>
  );
}