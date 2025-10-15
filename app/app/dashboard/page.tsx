/**
 * User Dashboard Page
 * Central hub for accessing all Recoder platforms
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Terminal, 
  Globe, 
  MessageSquare, 
  Code2,
  User,
  Settings,
  LogOut,
  ArrowRight,
  CheckCircle,
  Clock,
  Zap
} from 'lucide-react';

interface UserData {
  email: string;
  plan: string;
  quotas: {
    totalRequests: number;
    usedRequests: number;
    resetDate: string;
  };
  platforms: {
    cli: boolean;
    web: boolean;
    extension: boolean;
    router: boolean;
  };
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch real user data from API
    async function fetchUserData() {
      try {
        const response = await fetch('/api/dashboard/overview');
        if (!response.ok) {
          if (response.status === 401) {
            window.location.href = '/auth/signin';
            return;
          }
          throw new Error('Failed to fetch user data');
        }

        const result = await response.json();
        const data = result.data;
        
        setUser({
          email: data.user?.email || 'user@recoder.xyz',
          plan: data.subscription?.plan || 'free',
          quotas: {
            totalRequests: data.usage?.totalRequests || 6,
            usedRequests: data.usage?.usedToday || 0,
            resetDate: data.subscription?.currentPeriodEnd || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          },
          platforms: {
            cli: false,
            web: true,
            extension: false,
            router: false
          }
        });
      } catch (error) {
        console.error('Error fetching user data:', error);
        // Fallback to basic data if fetch fails
        setUser({
          email: 'user@recoder.xyz',
          plan: 'free',
          quotas: {
            totalRequests: 6,
            usedRequests: 0,
            resetDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          },
          platforms: {
            cli: false,
            web: true,
            extension: false,
            router: false
          }
        });
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    window.location.href = '/';
  };

  const platforms = [
    {
      name: 'Production Engine',
      description: '50+ AI models, deployment & enterprise features',
      icon: Zap,
      href: '/dashboard/production',
      color: 'from-gradient-to-r from-blue-600 to-purple-600',
      status: 'Available',
      isNew: true
    },
    {
      name: 'Recoder Web',
      description: 'Browser-based development platform',
      icon: Globe,
      href: '/platform/web',
      color: 'from-blue-500 to-blue-600',
      status: user?.platforms.web ? 'Connected' : 'Available'
    },
    {
      name: 'Recoder Chat',
      description: 'AI conversation interface',
      icon: MessageSquare,
      href: '/platform/chat',
      color: 'from-purple-500 to-purple-600',
      status: user?.platforms.web ? 'Connected' : 'Available'
    },
    {
      name: 'Recoder CLI',
      description: 'Terminal-based development tools',
      icon: Terminal,
      href: '/cli',
      color: 'from-green-500 to-green-600',
      status: user?.platforms.cli ? 'Connected' : 'Install Required'
    },
    {
      name: 'VS Code Extension',
      description: 'IDE integration and assistance',
      icon: Code2,
      href: '/extension',
      color: 'from-orange-500 to-orange-600',
      status: user?.platforms.extension ? 'Connected' : 'Install Required'
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Code2 className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Recoder.xyz
              </span>
            </Link>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-slate-600">Welcome back!</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Production Engine Banner */}
          <div className="mb-8 bg-gradient-to-r from-blue-600 via-purple-600 to-teal-600 rounded-lg p-6 text-white">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold mb-2">🚀 New: Production Engine Available!</h2>
                <p className="text-blue-100">
                  50+ AI models, one-click deployment, team collaboration, and enterprise features.
                </p>
              </div>
              <div className="flex gap-3">
                <Button asChild size="sm" className="bg-white text-blue-600 hover:bg-blue-50">
                  <Link href="/dashboard/production">Explore Features</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600">
                  <Link href="/dashboard/billing">View Pricing</Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Welcome Section */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">
              Welcome to Your Recoder Dashboard
            </h1>
            <p className="text-slate-600 dark:text-slate-300">
              Access all your AI-powered development tools from one place
            </p>
          </div>

          {/* User Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Account</p>
                    <p className="font-semibold capitalize">{user?.plan} Plan</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Zap className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">API Usage</p>
                    <p className="font-semibold">
                      {user?.quotas.usedRequests}/{user?.quotas.totalRequests}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                    <Clock className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Resets</p>
                    <p className="font-semibold text-sm">
                      {new Date(user?.quotas.resetDate || '').toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Platform Access */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6">Your Platforms</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {platforms.map((platform, index) => {
                const Icon = platform.icon;
                const isConnected = platform.status === 'Connected';
                
                return (
                  <Card key={index} className="group hover:shadow-lg transition-all duration-300">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className={`w-12 h-12 bg-gradient-to-r ${platform.color} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex items-center space-x-2">
                          {(platform as any).isNew && (
                            <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs px-2 py-1 rounded-full font-semibold">
                              NEW
                            </span>
                          )}
                          {isConnected ? (
                            <>
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span className="text-sm text-green-600">{platform.status}</span>
                            </>
                          ) : (
                            <span className="text-sm text-slate-500">{platform.status}</span>
                          )}
                        </div>
                      </div>
                      
                      <h3 className="text-lg font-semibold mb-2">{platform.name}</h3>
                      <p className="text-slate-600 mb-4">{platform.description}</p>
                      
                      <Button asChild className="w-full">
                        <Link href={platform.href} className="flex items-center justify-center space-x-2">
                          <span>
                            {isConnected ? 'Launch' : (platform.status.includes('Install') ? 'Install' : 'Access')}
                          </span>
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Frequently used features and shortcuts
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" asChild>
                <Link href="/platform/web">New Project</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/platform/chat">Ask AI</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/cli">CLI Guide</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/docs">Documentation</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}