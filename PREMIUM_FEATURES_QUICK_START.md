# 🚀 QUICK START: Premium Features Implementation

**Priority**: Implement these NOW for premium users  
**Time Estimate**: 3-4 days  
**Impact**: HIGH - Premium users get the features they paid for

---

## 📋 TASK BREAKDOWN

### ⭐ Task 0.1: Premium Settings Page (Day 1-2)

**File**: `/Users/arhansubasi/recoder.xyz/app/app/settings/premium/page.tsx`

**Step 1: Create the page structure**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { 
  Crown, 
  Key, 
  TrendingUp, 
  Zap, 
  Settings,
  Copy,
  RefreshCw,
  Trash2
} from 'lucide-react';

interface PremiumData {
  plan: string;
  status: string;
  features: string[];
  usage: {
    requests: number;
    limit: number;
    cost: number;
  };
  apiKeys: Array<{
    id: string;
    name: string;
    key: string;
    lastUsed: string;
    usageCount: number;
  }>;
}

export default function PremiumSettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [premiumData, setPremiumData] = useState<PremiumData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPremiumData();
  }, []);

  async function fetchPremiumData() {
    try {
      const res = await fetch('/api/user/premium-status');
      const data = await res.json();
      setPremiumData(data);
    } catch (error) {
      console.error('Failed to fetch premium data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Crown className="text-yellow-500" />
          Premium Settings
        </h1>
        <p className="text-gray-600 mt-2">
          Manage your premium subscription and features
        </p>
      </div>

      {/* Plan Overview */}
      <PlanOverview data={premiumData} />

      {/* API Key Management */}
      <ApiKeyManager 
        apiKeys={premiumData?.apiKeys || []}
        onRefresh={fetchPremiumData}
      />

      {/* Usage Metrics */}
      <UsageMetrics usage={premiumData?.usage} />

      {/* Premium Features */}
      <PremiumFeatures features={premiumData?.features || []} />
    </div>
  );
}

// Component implementations below...
```

**Step 2: Create API endpoint**

**File**: `/Users/arhansubasi/recoder.xyz/app/app/api/user/premium-status/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch user with subscription and API keys
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        subscription: true,
        apiKeys: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate usage this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usage = await prisma.usageRecord.aggregate({
      where: {
        userId: user.id,
        timestamp: { gte: startOfMonth },
      },
      _sum: {
        tokensUsed: true,
        cost: true,
      },
      _count: {
        id: true,
      },
    });

    // Get plan limits
    const planLimits = {
      free: 5000,
      pro: 100000,
      enterprise: 1000000,
    };

    const currentPlan = user.subscription?.planId || 'free';
    const limit = planLimits[currentPlan as keyof typeof planLimits] || 5000;

    return NextResponse.json({
      plan: currentPlan,
      status: user.subscription?.status || 'free',
      features: getPlanFeatures(currentPlan),
      usage: {
        requests: usage._count.id || 0,
        limit,
        cost: usage._sum.cost || 0,
        tokens: usage._sum.tokensUsed || 0,
      },
      apiKeys: user.apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        key: key.key.substring(0, 12) + '...' + key.key.substring(key.key.length - 4),
        lastUsed: key.lastUsedAt,
        usageCount: key.usageCount,
        createdAt: key.createdAt,
      })),
    });
  } catch (error) {
    console.error('Premium status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getPlanFeatures(plan: string): string[] {
  const features: Record<string, string[]> = {
    free: [
      '5,000 requests/month',
      'Basic AI models',
      'Community support',
    ],
    pro: [
      '100,000 requests/month',
      'All AI models (Claude, GPT-4, Gemini)',
      'CLI access',
      'Priority support',
      'Advanced analytics',
    ],
    enterprise: [
      'Unlimited requests',
      'All AI models',
      'CLI access',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
    ],
  };

  return features[plan] || features.free;
}
```

**Step 3: Create components**

**File**: `/Users/arhansubasi/recoder.xyz/app/app/settings/premium/components/ApiKeyManager.tsx`

```tsx
'use client';

import { useState } from 'react';
import { Key, Copy, RefreshCw, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  lastUsed: string;
  usageCount: number;
}

export function ApiKeyManager({ apiKeys, onRefresh }: { 
  apiKeys: ApiKey[];
  onRefresh: () => void;
}) {
  const [generating, setGenerating] = useState(false);

  async function generateKey() {
    setGenerating(true);
    try {
      const res = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: `CLI Key ${new Date().toLocaleDateString()}` 
        }),
      });
      
      if (res.ok) {
        toast.success('API key generated successfully!');
        onRefresh();
      } else {
        toast.error('Failed to generate API key');
      }
    } catch (error) {
      toast.error('Error generating API key');
    } finally {
      setGenerating(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (!confirm('Are you sure you want to revoke this API key?')) return;
    
    try {
      const res = await fetch(`/api/user/api-keys/${keyId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        toast.success('API key revoked');
        onRefresh();
      } else {
        toast.error('Failed to revoke API key');
      }
    } catch (error) {
      toast.error('Error revoking API key');
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    toast.success('API key copied to clipboard!');
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Key className="text-blue-500" />
          CLI API Keys
        </h2>
        <button
          onClick={generateKey}
          disabled={generating}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={16} />
          {generating ? 'Generating...' : 'Generate New Key'}
        </button>
      </div>

      {apiKeys.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Key size={48} className="mx-auto mb-4 opacity-50" />
          <p>No API keys yet. Generate one to use the CLI.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apiKeys.map((key) => (
            <div key={key.id} className="border rounded-lg p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="font-mono text-sm bg-gray-100 px-3 py-2 rounded inline-block">
                  {key.key}
                </div>
                <div className="text-sm text-gray-600 mt-2">
                  Last used: {key.lastUsed ? new Date(key.lastUsed).toLocaleString() : 'Never'}
                  {' • '}
                  {key.usageCount} requests
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copyKey(key.key)}
                  className="p-2 hover:bg-gray-100 rounded"
                  title="Copy key"
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={() => revokeKey(key.id)}
                  className="p-2 hover:bg-red-100 text-red-600 rounded"
                  title="Revoke key"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold mb-2">Using your API key with CLI:</h3>
        <pre className="bg-gray-900 text-green-400 p-3 rounded text-sm overflow-x-auto">
          {`# Install CLI
npm install -g recoder-code

# Login
recoder auth login

# Use AI
recoder generate "create a react component"`}
        </pre>
      </div>
    </div>
  );
}
```

---

### ⭐ Task 0.2: Usage Dashboard (Day 2-3)

**File**: `/Users/arhansubasi/recoder.xyz/app/app/dashboard/usage/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Zap, 
  Calendar,
  Download 
} from 'lucide-react';
import { Line } from 'react-chartjs-2';

export default function UsageDashboardPage() {
  const [usageData, setUsageData] = useState(null);
  const [timeRange, setTimeRange] = useState('30d');

  useEffect(() => {
    fetchUsageData(timeRange);
  }, [timeRange]);

  async function fetchUsageData(range: string) {
    const res = await fetch(`/api/analytics/usage?range=${range}`);
    const data = await res.json();
    setUsageData(data);
  }

  async function exportData() {
    const res = await fetch(`/api/analytics/export?range=${timeRange}&format=csv`);
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-${timeRange}.csv`;
    a.click();
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Usage Analytics</h1>
        <div className="flex gap-4">
          <select 
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="border rounded-lg px-4 py-2"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button
            onClick={exportData}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <SummaryCard
          icon={<Zap className="text-blue-500" />}
          title="Total Requests"
          value={usageData?.totalRequests || 0}
          change="+12%"
        />
        <SummaryCard
          icon={<TrendingUp className="text-green-500" />}
          title="Tokens Used"
          value={usageData?.totalTokens || 0}
          change="+8%"
        />
        <SummaryCard
          icon={<DollarSign className="text-purple-500" />}
          title="Total Cost"
          value={`$${usageData?.totalCost || 0}`}
          change="+5%"
        />
        <SummaryCard
          icon={<Calendar className="text-orange-500" />}
          title="Active Days"
          value={usageData?.activeDays || 0}
          change="-"
        />
      </div>

      {/* Usage Chart */}
      <UsageChart data={usageData?.timeline} />

      {/* CLI Sessions */}
      <CLISessionsTable sessions={usageData?.sessions} />
    </div>
  );
}
```

---

## 📊 DATABASE MIGRATION

Run this to add usage tracking:

```bash
cd /Users/arhansubasi/recoder.xyz/app

# Create migration file
npx prisma migrate dev --name add_usage_tracking --create-only
```

Add this to the migration file:

```sql
-- Add UsageRecord table
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "modelName" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL,
    "cost" REAL NOT NULL,
    "timestamp" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
    FOREIGN KEY ("sessionId") REFERENCES "CLISession"("id") ON DELETE SET NULL
);

CREATE INDEX "UsageRecord_userId_timestamp_idx" ON "UsageRecord"("userId", "timestamp");
CREATE INDEX "UsageRecord_sessionId_idx" ON "UsageRecord"("sessionId");

-- Add columns to ApiKey
ALTER TABLE "ApiKey" ADD COLUMN "expiresAt" TIMESTAMP;
ALTER TABLE "ApiKey" ADD COLUMN "lastUsedAt" TIMESTAMP;
ALTER TABLE "ApiKey" ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ApiKey" ADD COLUMN "rateLimit" INTEGER;
ALTER TABLE "ApiKey" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
```

Then apply:

```bash
npx prisma migrate dev
npx prisma generate
```

---

## ✅ IMPLEMENTATION CHECKLIST

### Day 1:
- [ ] Create `/settings/premium/page.tsx`
- [ ] Create `/api/user/premium-status/route.ts`
- [ ] Create API key manager component
- [ ] Test premium settings page

### Day 2:
- [ ] Create database migration
- [ ] Apply migration
- [ ] Create `/dashboard/usage/page.tsx`
- [ ] Create usage analytics API

### Day 3:
- [ ] Add usage charts
- [ ] Add CLI session management
- [ ] Add export functionality
- [ ] Test complete flow

### Day 4:
- [ ] Polish UI/UX
- [ ] Add loading states
- [ ] Add error handling
- [ ] E2E testing
- [ ] Deploy

---

## 🚀 QUICK DEPLOY

```bash
# 1. Create files
cd /Users/arhansubasi/recoder.xyz/app

# 2. Database migration
npx prisma migrate dev --name add_usage_tracking

# 3. Test locally
npm run dev

# 4. Test premium flow
# - Login as premium user
# - Visit /settings/premium
# - Generate API key
# - Visit /dashboard/usage

# 5. Deploy
vercel --prod
```

---

**Start with Task 0.1 (Premium Settings) - highest impact!** 🎯
