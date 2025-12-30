'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserStats();
  }, []);

  const fetchUserStats = async () => {
    try {
      // This would connect to the production engine API
      const response = await fetch('http://localhost:4567/api/dashboard/user-stats', {
        headers: {
          'x-user-id': 'current-user', // Replace with actual user ID
          'Authorization': 'Bearer ' + localStorage.getItem('authToken')
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUserStats(data.data);
      } else {
        // Mock data for development
        setUserStats({
          subscription: {
            tier: 'Professional',
            status: 'active',
            usage: {
              codeGenerated: 45000,
              apiCalls: 1200,
              deploymentsCount: 23
            },
            limits: {
              codeGeneration: 100000,
              apiCalls: 5000,
              deployments: 50
            }
          },
          billing: {
            currentCost: 29.00,
            nextBillingDate: '2024-09-20',
            paymentMethod: 'Credit Card ending in 4242'
          },
          projects: {
            total: 12,
            active: 8,
            shared: 3
          },
          analytics: {
            thisMonth: {
              projects: 5,
              deployments: 12,
              savings: 180
            }
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
    return Math.min((used / limit) * 100, 100);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage > 90) return 'text-red-600';
    if (percentage > 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (loading) {
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
              {userStats.subscription.usage.codeGenerated.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              lines of {userStats.subscription.limits.codeGeneration.toLocaleString()} limit
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ 
                  width: `${getUsagePercentage(
                    userStats.subscription.usage.codeGenerated, 
                    userStats.subscription.limits.codeGeneration
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
              {userStats.subscription.usage.apiCalls.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              of {userStats.subscription.limits.apiCalls.toLocaleString()} limit
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{ 
                  width: `${getUsagePercentage(
                    userStats.subscription.usage.apiCalls, 
                    userStats.subscription.limits.apiCalls
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
              {userStats.subscription.usage.deploymentsCount}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              of {userStats.subscription.limits.deployments} limit
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-purple-600 h-2 rounded-full transition-all"
                style={{ 
                  width: `${getUsagePercentage(
                    userStats.subscription.usage.deploymentsCount, 
                    userStats.subscription.limits.deployments
                  )}%` 
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Billing & Projects */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Billing Information</CardTitle>
            <CardDescription>Current subscription and payment details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Current Bill</span>
              <span className="text-lg font-semibold">${userStats.billing.currentCost}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Next Billing</span>
              <span className="text-sm">{userStats.billing.nextBillingDate}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Payment Method</span>
              <span className="text-sm">{userStats.billing.paymentMethod}</span>
            </div>
            <Button variant="outline" className="w-full">
              Manage Billing
            </Button>
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
              <span className="text-lg font-semibold">{userStats.projects.total}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Active Projects</span>
              <span className="text-sm">{userStats.projects.active}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Shared Projects</span>
              <span className="text-sm">{userStats.projects.shared}</span>
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
                {userStats.analytics.thisMonth.projects}
              </div>
              <div className="text-sm text-gray-600">Projects Created</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {userStats.analytics.thisMonth.deployments}
              </div>
              <div className="text-sm text-gray-600">Deployments</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">
                ${userStats.analytics.thisMonth.savings}
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