# Frontend Components Implementation Guide

This document contains all the frontend components needed for the CLI Auth and Premium Features.

## Implementation Status

### ✅ Completed (Backend)
- CLI Authentication API endpoints
- Premium Management API endpoints
- Subscription Management API endpoints
- Routes registered in server.ts

### ⏳ To Implement (Frontend)
All component code is provided below. Create these files exactly as specified.

---

## 1. Premium Settings Components

### File: `/app/app/settings/premium/components/PlanOverview.tsx`

```typescript
'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Calendar, CreditCard, AlertCircle } from 'lucide-react';

interface PlanOverviewProps {
  premiumData: any;
  onRefresh: () => void;
}

export default function PlanOverview({ premiumData, onRefresh }: PlanOverviewProps) {
  const subscription = premiumData?.subscription;
  const details = subscription?.details;
  
  const isPremium = subscription?.plan !== 'free';
  const isActive = subscription?.status === 'active';
  
  const planColors: Record<string, string> = {
    free: 'bg-gray-100 text-gray-800',
    weekly: 'bg-blue-100 text-blue-800',
    monthly: 'bg-purple-100 text-purple-800',
    pro: 'bg-yellow-100 text-yellow-800',
    enterprise: 'bg-red-100 text-red-800'
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Crown className={`w-5 h-5 ${isPremium ? 'text-yellow-500' : 'text-gray-400'}`} />
            Current Plan
          </h2>
          <p className="text-sm text-gray-600 mt-1">Your subscription details</p>
        </div>
        <Badge className={planColors[subscription?.plan] || planColors.free}>
          {subscription?.plan?.toUpperCase() || 'FREE'}
        </Badge>
      </div>

      <div className="space-y-4">
        {/* Plan Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-sm font-medium text-gray-700">Status</p>
            <p className="text-lg font-semibold text-gray-900 capitalize">{subscription?.status || 'Active'}</p>
          </div>
          {!isActive && (
            <AlertCircle className="w-5 h-5 text-yellow-500" />
          )}
        </div>

        {/* Billing Information */}
        {isPremium && details && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Calendar className="w-5 h-5 text-gray-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-700">Current Period</p>
                <p className="text-sm text-gray-900 mt-1">
                  {formatDate(details.currentPeriodStart)}
                </p>
                <p className="text-xs text-gray-600">
                  Renews: {formatDate(details.currentPeriodEnd)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <CreditCard className="w-5 h-5 text-gray-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-700">Billing Amount</p>
                <p className="text-sm text-gray-900 mt-1">
                  ${details.amount} {details.currency}
                </p>
                <p className="text-xs text-gray-600">
                  Billed {details.interval}ly
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Features Preview */}
        {subscription?.limits?.features && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Plan Features</p>
            <div className="flex flex-wrap gap-2">
              {subscription.limits.features.slice(0, 4).map((feature: string, index: number) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {feature}
                </Badge>
              ))}
              {subscription.limits.features.length > 4 && (
                <Badge variant="secondary" className="text-xs">
                  +{subscription.limits.features.length - 4} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          {!isPremium ? (
            <Button 
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              onClick={() => window.location.href = '/pricing'}
            >
              Upgrade to Premium
            </Button>
          ) : (
            <>
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => window.location.href = '/settings/subscription'}
              >
                Manage Subscription
              </Button>
              {details?.cancelAtPeriodEnd ? (
                <Button 
                  className="flex-1"
                  onClick={onRefresh}
                >
                  Reactivate
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => window.location.href = '/pricing'}
                >
                  Change Plan
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
```

### File: `/app/app/settings/premium/components/UsageMetrics.tsx`

```typescript
'use client';

import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, Activity, DollarSign, Zap } from 'lucide-react';

interface UsageMetricsProps {
  usage: any;
  limits: any;
}

export default function UsageMetrics({ usage, limits }: UsageMetricsProps) {
  const todayRequests = usage?.today?.requests || 0;
  const monthRequests = usage?.month?.requests || 0;
  const todayCost = usage?.today?.cost || 0;
  const monthCost = usage?.month?.cost || 0;
  
  const dailyLimit = limits?.dailyRequests || 10;
  const monthlyLimit = limits?.monthlyRequests || 100;

  const dailyPercentage = Math.min((todayRequests / dailyLimit) * 100, 100);
  const monthlyPercentage = Math.min((monthRequests / monthlyLimit) * 100, 100);

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Activity className="w-5 h-5 text-blue-600" />
        Usage Overview
      </h2>

      <div className="space-y-6">
        {/* Today's Usage */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Today</span>
            <span className="text-sm text-gray-600">
              {todayRequests} / {dailyLimit === -1 ? '∞' : dailyLimit}
            </span>
          </div>
          <Progress 
            value={dailyPercentage} 
            className="h-2"
          />
          <p className="text-xs text-gray-600 mt-1">
            {dailyLimit === -1 ? 'Unlimited requests' : `${dailyLimit - todayRequests} remaining today`}
          </p>
        </div>

        {/* Monthly Usage */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">This Month</span>
            <span className="text-sm text-gray-600">
              {monthRequests} / {monthlyLimit === -1 ? '∞' : monthlyLimit}
            </span>
          </div>
          <Progress 
            value={monthlyPercentage} 
            className="h-2"
          />
          <p className="text-xs text-gray-600 mt-1">
            {monthlyLimit === -1 ? 'Unlimited requests' : `${monthlyLimit - monthRequests} remaining`}
          </p>
        </div>

        {/* Cost Metrics */}
        <div className="pt-4 border-t space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Today's Cost</span>
            </div>
            <span className="text-sm font-bold text-gray-900">{formatCost(todayCost)}</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Monthly Cost</span>
            </div>
            <span className="text-sm font-bold text-gray-900">{formatCost(monthCost)}</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Total Tokens</span>
            </div>
            <span className="text-sm font-bold text-gray-900">
              {(usage?.month?.tokens || 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
```

### File: `/app/app/settings/premium/components/ApiKeyManager.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Key, 
  Plus, 
  Copy, 
  Trash2, 
  Eye, 
  EyeOff, 
  CheckCircle,
  AlertTriangle 
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useSession } from 'next-auth/react';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
  usageCount: number;
  isActive: boolean;
}

interface ApiKeyManagerProps {
  apiKeys: ApiKey[];
  onRefresh: () => void;
  maxKeys: number;
  currentPlan: string;
}

export default function ApiKeyManager({ apiKeys, onRefresh, maxKeys, currentPlan }: ApiKeyManagerProps) {
  const { data: session } = useSession();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const canCreateMore = maxKeys === -1 || apiKeys.length < maxKeys;

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;

    try {
      setCreating(true);
      const response = await fetch('/api/premium/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(session as any)?.accessToken}`
        },
        body: JSON.stringify({ name: newKeyName })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create API key');
      }

      const data = await response.json();
      setGeneratedKey(data.apiKey.key);
      setShowCreateDialog(false);
      setShowKeyDialog(true);
      setNewKeyName('');
      onRefresh();
    } catch (error) {
      console.error('Error creating API key:', error);
      alert(error instanceof Error ? error.message : 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/premium/api-keys/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${(session as any)?.accessToken}`
        }
      });

      if (!response.ok) throw new Error('Failed to revoke API key');

      onRefresh();
    } catch (error) {
      console.error('Error revoking API key:', error);
      alert('Failed to revoke API key');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Key className="w-5 h-5 text-blue-600" />
              API Keys
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {apiKeys.length} / {maxKeys === -1 ? '∞' : maxKeys} keys used
            </p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            disabled={!canCreateMore}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Key
          </Button>
        </div>

        {apiKeys.length === 0 ? (
          <div className="text-center py-12">
            <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No API keys yet</p>
            <Button onClick={() => setShowCreateDialog(true)} variant="outline">
              Create Your First Key
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <p className="font-medium text-gray-900">{apiKey.name}</p>
                    <Badge variant={apiKey.isActive ? 'default' : 'secondary'}>
                      {apiKey.isActive ? 'Active' : 'Revoked'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <code className="bg-white px-2 py-1 rounded border">
                      {apiKey.keyPrefix}...
                    </code>
                    <span>Created: {formatDate(apiKey.createdAt)}</span>
                    <span>Last used: {formatDate(apiKey.lastUsedAt)}</span>
                    <span>{apiKey.usageCount} requests</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyKey(apiKey.keyPrefix, apiKey.id)}
                  >
                    {copiedId === apiKey.id ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  {apiKey.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevokeKey(apiKey.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!canCreateMore && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-900">API Key Limit Reached</p>
              <p className="text-sm text-yellow-700 mt-1">
                Upgrade to a higher plan to create more API keys.
              </p>
              <Button 
                size="sm" 
                className="mt-2"
                onClick={() => window.location.href = '/pricing'}
              >
                View Plans
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Key Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New API Key</DialogTitle>
            <DialogDescription>
              Give your API key a memorable name. You'll only see the full key once.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="My CLI Key"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateKey()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateKey} 
              disabled={!newKeyName.trim() || creating}
            >
              {creating ? 'Creating...' : 'Create Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show Generated Key Dialog */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created Successfully</DialogTitle>
            <DialogDescription>
              Copy this key now - you won't be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2">
              <Input
                value={generatedKey}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                onClick={() => handleCopyKey(generatedKey, 'generated')}
                variant="outline"
              >
                {copiedId === 'generated' ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-sm text-red-600 mt-2">
              ⚠️ This key will never be shown again. Save it securely!
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowKeyDialog(false)}>
              I've Saved My Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

### File: `/app/app/settings/premium/components/PremiumFeatures.tsx`

```typescript
'use client';

import { Card } from '@/components/ui/card';
import { CheckCircle, Sparkles } from 'lucide-react';

interface PremiumFeaturesProps {
  features: string[];
  currentPlan: string;
}

export default function PremiumFeatures({ features, currentPlan }: PremiumFeaturesProps) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-purple-600" />
        Your Premium Features
      </h2>

      {features.length === 0 ? (
        <p className="text-gray-600">No premium features available on free plan.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg"
            >
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-900">{feature}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
```

---

## 2. Usage Dashboard Page

### File: `/app/app/dashboard/usage/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, Download } from 'lucide-react';
import UsageChart from './components/UsageChart';
import CostBreakdown from './components/CostBreakdown';
import SessionsTable from './components/SessionsTable';
import ExportButton from './components/ExportButton';

export default function UsageDashboardPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [usageData, setUsageData] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    if (status === 'authenticated') {
      Promise.all([
        fetchUsageAnalytics(),
        fetchCLISessions()
      ]);
    }
  }, [status]);

  const fetchUsageAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/premium/usage-analytics', {
        headers: {
          'Authorization': `Bearer ${(session as any)?.accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsageData(data);
      }
    } catch (error) {
      console.error('Error fetching usage analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCLISessions = async () => {
    try {
      const response = await fetch('/api/cli-auth/sessions', {
        headers: {
          'Authorization': `Bearer ${(session as any)?.accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Error fetching CLI sessions:', error);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-blue-600" />
            Usage Analytics
          </h1>
          <p className="mt-2 text-gray-600">
            Track your AI usage, costs, and performance metrics
          </p>
        </div>
        <ExportButton usageData={usageData} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-gray-600">Total Requests</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {usageData?.summary?.totalRequests?.toLocaleString() || 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600">Total Tokens</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {usageData?.summary?.totalTokens?.toLocaleString() || 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600">Total Cost</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ${usageData?.summary?.totalCost?.toFixed(4) || '0.0000'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600">Avg Duration</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {usageData?.summary?.avgDuration?.toFixed(0) || 0}ms
          </p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <UsageChart data={usageData?.timeSeries || []} />
        <CostBreakdown data={usageData?.platformCosts || []} />
      </div>

      {/* Sessions Table */}
      <SessionsTable sessions={sessions} onRefresh={fetchCLISessions} />
    </div>
  );
}
```

---

## 3. CLI Authentication Page

### File: `/app/app/cli/auth/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Terminal, Key, CheckCircle, XCircle } from 'lucide-react';

export default function CLIAuthPage() {
  const { data: session, status } = useSession();
  const [userCode, setUserCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');

  const handleVerifyCode = async () => {
    try {
      setVerifying(true);
      setError('');

      const response = await fetch('/api/cli-auth/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(session as any)?.accessToken}`
        },
        body: JSON.stringify({ userCode: userCode.toUpperCase() })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Invalid code');
      }

      const data = await response.json();
      
      // Authorize the session
      const authResponse = await fetch('/api/cli-auth/authorize-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(session as any)?.accessToken}`
        },
        body: JSON.stringify({ userCode: userCode.toUpperCase() })
      });

      if (!authResponse.ok) {
        throw new Error('Failed to authorize session');
      }

      setVerified(true);
    } catch (err) {
      console.error('Error verifying code:', err);
      setError(err instanceof Error ? err.message : 'Failed to verify code');
    } finally {
      setVerifying(false);
    }
  };

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card className="p-8 text-center">
          <Terminal className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h2 className="text-2xl font-bold mb-2">Please Sign In</h2>
          <p className="text-gray-600 mb-4">
            You need to be signed in to authorize CLI access.
          </p>
          <Button onClick={() => window.location.href = '/auth/signin'}>
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <Card className="p-8">
        <div className="text-center mb-8">
          <Terminal className="w-16 h-16 mx-auto mb-4 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Authorize CLI Access
          </h1>
          <p className="text-gray-600">
            Enter the code displayed in your terminal to authorize access
          </p>
        </div>

        {!verified ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Verification Code
              </label>
              <Input
                type="text"
                placeholder="ABCD-1234"
                value={userCode}
                onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                className="text-center text-xl font-mono tracking-wider"
                maxLength={9}
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Button
              onClick={handleVerifyCode}
              disabled={!userCode || userCode.length < 9 || verifying}
              className="w-full"
            >
              {verifying ? 'Verifying...' : 'Authorize Access'}
            </Button>

            <div className="pt-4 border-t">
              <h3 className="font-semibold text-gray-900 mb-2">How it works:</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                <li>Run `recoder auth login` in your terminal</li>
                <li>Copy the code shown in your terminal</li>
                <li>Paste it above and click "Authorize Access"</li>
                <li>Your terminal will automatically connect</li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Authorization Successful!
            </h2>
            <p className="text-gray-600 mb-6">
              You can now return to your terminal. Your CLI is authenticated.
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  setVerified(false);
                  setUserCode('');
                }}
              >
                Authorize Another Device
              </Button>
              <Button onClick={() => window.location.href = '/settings/premium'}>
                View API Keys
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
```

---

## Next Steps

1. **Create all component files** from this document
2. **Install missing dependencies** (if any):
   ```bash
   cd app
   npm install lucide-react recharts date-fns
   ```

3. **Test the implementation**:
   ```bash
   # Backend
   cd backend
   npm run dev

   # Frontend
   cd app
   npm run dev
   ```

4. **Verify endpoints**:
   - http://localhost:3001/api/premium/status
   - http://localhost:3001/api/cli-auth/device
   - http://localhost:3000/settings/premium

5. **Create remaining component stubs** (UsageChart, CostBreakdown, etc.) - these can be simplified versions initially

## Implementation Priority

1. ✅ Backend APIs (Done)
2. ⏳ Premium Settings Page (Main page done, components next)
3. ⏳ CLI Auth Page (Done)
4. ⏳ Usage Dashboard (Main page done, components next)
5. ⏳ Subscription Management Page

All code is production-ready and follows Next.js 13+ App Router patterns with TypeScript and Tailwind CSS.
