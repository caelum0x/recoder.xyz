'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session-provider';

interface UserStats {
  subscription: {
    tier: string;
    status: string;
    usage: {
      codeGenerated: number;
      apiCalls: number;
      deploymentsCount: number;
    };
    limits: {
      codeGeneration: number;
      apiCalls: number;
      deployments: number;
    };
  };
  billing: {
    currentCost: number;
    nextBillingDate: string;
    paymentMethod: string;
  };
  projects: {
    total: number;
    active: number;
    shared: number;
  };
  analytics: {
    thisMonth: {
      projects: number;
      deployments: number;
      savings: number;
    };
  };
}

export default function ProductionDashboard() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/auth/signin');
      return;
    }

    if (!isPending && session) {
      void fetchUserStats();
    }
  }, [isPending, router, session]);

  const fetchUserStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/user/dashboard', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        const dashboard = data.data || data;
        setUserStats({
          subscription: {
            tier: dashboard.subscription?.plan || dashboard.subscription?.tier || 'Free',
            status: dashboard.subscription?.status || 'active',
            usage: {
              codeGenerated: dashboard.usage?.usedRequests || 0,
              apiCalls: dashboard.usage?.totalRequests || 0,
              deploymentsCount: dashboard.router_stats?.deploymentsCount || 0,
            },
            limits: {
              codeGeneration: dashboard.subscription?.limits?.codeGeneration || dashboard.usage?.totalRequests || 0,
              apiCalls: dashboard.subscription?.limits?.apiCalls || dashboard.usage?.totalRequests || 0,
              deployments: dashboard.subscription?.limits?.deployments || dashboard.router_stats?.deploymentsCount || 0,
            }
          },
          billing: {
            currentCost: dashboard.cost_savings || 0,
            nextBillingDate: dashboard.subscription?.renewsAt || '',
            paymentMethod: ''
          },
          projects: {
            total: dashboard.router_stats?.projectsTotal || 0,
            active: dashboard.router_stats?.projectsActive || 0,
            shared: dashboard.router_stats?.projectsShared || 0,
          },
          analytics: {
            thisMonth: {
              projects: dashboard.router_stats?.projectsThisMonth || 0,
              deployments: dashboard.router_stats?.deploymentsThisMonth || 0,
              savings: dashboard.cost_savings || 0,
            }
          }
        });
      } else {
        setUserStats({
          subscription: {
            tier: 'Free',
            status: 'active',
            usage: { codeGenerated: 0, apiCalls: 0, deploymentsCount: 0 },
            limits: { codeGeneration: 0, apiCalls: 0, deployments: 0 }
          },
          billing: {
            currentCost: 0,
            nextBillingDate: '',
            paymentMethod: ''
          },
          projects: {
            total: 0,
            active: 0,
            shared: 0
          },
          analytics: {
            thisMonth: { projects: 0, deployments: 0, savings: 0 }
          }
        });
      }
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getUsagePercentage = (used: number, limit: number) => {
    const safeUsed = Number.isFinite(used) ? used : 0;
    const safeLimit = Number.isFinite(limit) ? limit : 0;
    if (safeLimit <= 0) return 0;
    return Math.min((safeUsed / safeLimit) * 100, 100);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage > 90) return 'text-red-600';
    if (percentage > 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (isPending || loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-red-200">
          <CardContent className="p-6">
            <div className="text-red-600 text-center">
              <h3 className="text-lg font-semibold mb-2">Dashboard Error</h3>
              <p>{error}</p>
              <Button onClick={fetchUserStats} className="mt-4">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!userStats) return null;

  const codeGenerated = Number(userStats.subscription.usage.codeGenerated || 0);
  const codeGenerationLimit = Number(userStats.subscription.limits.codeGeneration || 0);
  const apiCalls = Number(userStats.subscription.usage.apiCalls || 0);
  const apiCallsLimit = Number(userStats.subscription.limits.apiCalls || 0);
  const deploymentsCount = Number(userStats.subscription.usage.deploymentsCount || 0);
  const deploymentsLimit = Number(userStats.subscription.limits.deployments || 0);
  const currentCost = Number(userStats.billing.currentCost || 0);
  const projectsTotal = Number(userStats.projects.total || 0);
  const projectsActive = Number(userStats.projects.active || 0);
  const projectsShared = Number(userStats.projects.shared || 0);
  const monthProjects = Number(userStats.analytics.thisMonth.projects || 0);
  const monthDeployments = Number(userStats.analytics.thisMonth.deployments || 0);
  const monthSavings = Number(userStats.analytics.thisMonth.savings || 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Production Dashboard</h1>
          <p className="text-gray-600">Monitor your AI development platform usage</p>
        </div>
        <Badge variant={userStats.subscription.status === 'active' ? 'default' : 'secondary'}>
          {userStats.subscription.tier} Plan
        </Badge>
      </div>

      {/* Usage Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Code Generated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {codeGenerated.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              lines of {codeGenerationLimit.toLocaleString()} limit
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ 
                  width: `${getUsagePercentage(
                    userStats.subscription.usage.codeGenerated, 
                    codeGenerationLimit
                  )}%` 
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">API Calls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {apiCalls.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              of {apiCallsLimit.toLocaleString()} limit
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{ 
                  width: `${getUsagePercentage(
                    apiCalls, 
                    apiCallsLimit
                  )}%` 
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Deployments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {deploymentsCount}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              of {deploymentsLimit} limit
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-purple-600 h-2 rounded-full transition-all"
                style={{ 
                  width: `${getUsagePercentage(
                    deploymentsCount, 
                    deploymentsLimit
                  )}%` 
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan & Projects */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Plan Information</CardTitle>
            <CardDescription>Current subscription and access details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Current Plan</span>
              <span className="text-lg font-semibold capitalize">{userStats.subscription.tier}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Current Cost</span>
              <span className="text-lg font-semibold">${currentCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Renewal Date</span>
              <span className="text-sm">{userStats.billing.nextBillingDate}</span>
            </div>
            <a href="/pricing" className="block">
              <Button variant="outline" className="w-full">
                View Plans
              </Button>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Statistics</CardTitle>
            <CardDescription>Your development activity overview</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Projects</span>
              <span className="text-lg font-semibold">{projectsTotal}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Active Projects</span>
              <span className="text-sm">{projectsActive}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Shared Projects</span>
              <span className="text-sm">{projectsShared}</span>
            </div>
            <Button variant="outline" className="w-full">
              View All Projects
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* This Month Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>This Month's Activity</CardTitle>
          <CardDescription>Your development productivity metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                {monthProjects}
              </div>
              <div className="text-sm text-gray-600">Projects Created</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {monthDeployments}
              </div>
              <div className="text-sm text-gray-600">Deployments</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">
                ${monthSavings.toFixed(2)}
              </div>
              <div className="text-sm text-gray-600">Development Time Saved</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Button className="h-16 flex flex-col justify-center">
              <span className="text-lg">🚀</span>
              <span className="text-sm">Generate Code</span>
            </Button>
            <Button variant="outline" className="h-16 flex flex-col justify-center">
              <span className="text-lg">📱</span>
              <span className="text-sm">Deploy Project</span>
            </Button>
            <Button variant="outline" className="h-16 flex flex-col justify-center">
              <span className="text-lg">🏪</span>
              <span className="text-sm">Browse Templates</span>
            </Button>
            <Button variant="outline" className="h-16 flex flex-col justify-center">
              <span className="text-lg">👥</span>
              <span className="text-sm">Team Collaboration</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
