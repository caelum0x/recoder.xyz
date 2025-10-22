# 🚀 Frontend Quick Start Guide - CLI Auth & Premium Features

## Overview

This guide helps you quickly build the frontend pages for the CLI authentication and premium features system. All backend APIs are ready and tested.

## 📋 Pages to Build

### Priority 1: CLI Authorization Page (2-3 hours)
**Path**: `/app/app/cli/authorize/page.tsx`

**URL Pattern**: `/cli/authorize?code=ABCD-1234`

**Purpose**: Allow users to authorize CLI tool access

**Example Implementation**:
```typescript
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function CLIAuthorizePage() {
  const searchParams = useSearchParams();
  const userCode = searchParams.get('code');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (userCode) {
      verifyCode(userCode);
    }
  }, [userCode]);

  async function verifyCode(code: string) {
    try {
      const res = await fetch('/api/auth/cli/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ userCode: code })
      });
      
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
      }
    } catch (err) {
      setError('Invalid or expired code');
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthorize() {
    try {
      setLoading(true);
      const res = await fetch('/api/auth/cli/authorize-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ userCode })
      });

      if (res.ok) {
        // Show success message
        alert('CLI authorized successfully! Return to your terminal.');
      }
    } catch (err) {
      setError('Failed to authorize');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeny() {
    try {
      await fetch('/api/auth/cli/deny-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ userCode })
      });
      alert('Authorization denied');
    } catch (err) {
      setError('Failed to deny');
    }
  }

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="container mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold mb-6">Authorize CLI Access</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="text-center mb-6">
          <div className="text-4xl font-mono font-bold text-blue-600 mb-2">
            {userCode}
          </div>
          <p className="text-gray-600">Verification Code</p>
        </div>

        {session?.deviceInfo && (
          <div className="bg-gray-50 rounded p-4 mb-6">
            <h3 className="font-semibold mb-2">Device Information</h3>
            <p className="text-sm text-gray-600">
              Platform: {session.deviceInfo.platform || 'Unknown'}
            </p>
            <p className="text-sm text-gray-600">
              IP Address: {session.ipAddress || 'Unknown'}
            </p>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={handleAuthorize}
            className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700"
          >
            Authorize
          </button>
          <button
            onClick={handleDeny}
            className="flex-1 bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-semibold hover:bg-gray-300"
          >
            Deny
          </button>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          ⚠️ Only authorize if you initiated this request from your terminal.
        </p>
      </div>
    </div>
  );
}

function getAuthToken() {
  // Your auth token getter
  return localStorage.getItem('auth_token') || '';
}
```

### Priority 2: Premium Settings Page (3-4 hours)
**Path**: `/app/app/settings/premium/page.tsx`

**Example Implementation**:
```typescript
'use client';

import { useState, useEffect } from 'react';

export default function PremiumSettingsPage() {
  const [status, setStatus] = useState(null);
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPremiumStatus();
    loadApiKeys();
  }, []);

  async function loadPremiumStatus() {
    const res = await fetch('/api/premium/status', {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const data = await res.json();
    setStatus(data);
    setLoading(false);
  }

  async function loadApiKeys() {
    const res = await fetch('/api/premium/api-keys', {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const data = await res.json();
    setApiKeys(data.apiKeys);
  }

  async function handleGenerateKey() {
    const name = prompt('Enter API key name:');
    if (!name) return;

    const res = await fetch('/api/premium/api-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ name })
    });

    const data = await res.json();
    if (data.success) {
      alert(`API Key Generated:\n${data.apiKey.key}\n\nCopy this now, it won't be shown again!`);
      loadApiKeys();
    }
  }

  async function handleRevokeKey(keyId: string) {
    if (!confirm('Revoke this API key?')) return;

    await fetch(`/api/premium/api-key/${keyId}/revoke`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });

    loadApiKeys();
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <h1 className="text-3xl font-bold mb-6">Premium Settings</h1>

      {/* Plan Overview */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-6 text-white mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">
              {status?.user.subscription.toUpperCase()} Plan
            </h2>
            <p className="opacity-90">
              Member since {new Date(status?.user.memberSince).toLocaleDateString()}
            </p>
          </div>
          {status?.user.subscription === 'free' && (
            <button className="bg-white text-blue-600 py-2 px-6 rounded-lg font-semibold hover:bg-gray-100">
              Upgrade to Pro
            </button>
          )}
        </div>
      </div>

      {/* Usage Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-semibold mb-2">Monthly Usage</h3>
          <div className="text-3xl font-bold text-blue-600">
            {status?.usage.monthly.requests}
          </div>
          <p className="text-sm text-gray-500">
            of {status?.usage.monthly.limit} requests
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div
              className="bg-blue-600 h-2 rounded-full"
              style={{ width: `${status?.usage.monthly.percentage}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-semibold mb-2">Daily Usage</h3>
          <div className="text-3xl font-bold text-green-600">
            {status?.usage.daily.requests}
          </div>
          <p className="text-sm text-gray-500">
            of {status?.usage.daily.limit} requests
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div
              className="bg-green-600 h-2 rounded-full"
              style={{ width: `${status?.usage.daily.percentage}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-semibold mb-2">Cost</h3>
          <div className="text-3xl font-bold text-purple-600">
            ${status?.usage.cost.current.toFixed(2)}
          </div>
          <p className="text-sm text-gray-500">
            of ${status?.usage.cost.limit} limit
          </p>
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">API Keys</h2>
          <button
            onClick={handleGenerateKey}
            className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
          >
            Generate New Key
          </button>
        </div>

        {apiKeys.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No API keys yet</p>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <p className="font-semibold">{key.name}</p>
                  <p className="text-sm text-gray-500 font-mono">{key.keyPrefix}...</p>
                  <p className="text-xs text-gray-400">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                    {key.lastUsedAt && ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => handleRevokeKey(key.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getAuthToken() {
  return localStorage.getItem('auth_token') || '';
}
```

### Priority 3: Usage Dashboard (3-4 hours)
**Path**: `/app/app/dashboard/usage/page.tsx`

**Required Libraries**:
```bash
pnpm add recharts date-fns
```

**Example Implementation**:
```typescript
'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { format, subDays } from 'date-fns';

export default function UsageDashboardPage() {
  const [analytics, setAnalytics] = useState(null);
  const [dateRange, setDateRange] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  async function loadAnalytics() {
    setLoading(true);
    const startDate = subDays(new Date(), dateRange).toISOString();
    const endDate = new Date().toISOString();

    const res = await fetch(
      `/api/usage-analytics?startDate=${startDate}&endDate=${endDate}`,
      { headers: { 'Authorization': `Bearer ${getAuthToken()}` } }
    );

    const data = await res.json();
    setAnalytics(data);
    setLoading(false);
  }

  async function handleExport(format: 'csv' | 'json') {
    const res = await fetch('/api/usage-analytics/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ format })
    });

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-export.${format}`;
    a.click();
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto max-w-7xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Usage Dashboard</h1>
        <div className="flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="border rounded-lg px-4 py-2"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={() => handleExport('csv')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-semibold mb-2">Total Requests</h3>
          <div className="text-3xl font-bold">{analytics?.summary.totalRequests}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-semibold mb-2">Total Tokens</h3>
          <div className="text-3xl font-bold">{analytics?.summary.totalTokens.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-semibold mb-2">Total Cost</h3>
          <div className="text-3xl font-bold">${analytics?.summary.totalCost.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-semibold mb-2">Success Rate</h3>
          <div className="text-3xl font-bold">{analytics?.summary.successRate.toFixed(1)}%</div>
        </div>
      </div>

      {/* Usage Chart */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Usage Over Time</h2>
        <LineChart width={1000} height={400} data={analytics?.daily}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="requests" stroke="#3b82f6" />
          <Line type="monotone" dataKey="cost" stroke="#10b981" />
        </LineChart>
      </div>
    </div>
  );
}

function getAuthToken() {
  return localStorage.getItem('auth_token') || '';
}
```

### Priority 4: CLI Sessions Management (2-3 hours)
**Path**: `/app/app/settings/cli/page.tsx`

**Example Implementation**:
```typescript
'use client';

import { useState, useEffect } from 'react';

export default function CLISessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    const res = await fetch('/api/auth/cli/sessions', {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const data = await res.json();
    setSessions(data.sessions);
    setLoading(false);
  }

  async function revokeSession(sessionId: string) {
    if (!confirm('Revoke this CLI session?')) return;

    await fetch(`/api/auth/cli/session/${sessionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });

    loadSessions();
  }

  async function revokeAll() {
    if (!confirm('Revoke ALL CLI sessions?')) return;

    await fetch('/api/auth/cli/sessions/all', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });

    loadSessions();
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">CLI Sessions</h1>
        {sessions.length > 0 && (
          <button
            onClick={revokeAll}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Revoke All
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 text-lg mb-4">No active CLI sessions</p>
          <p className="text-sm text-gray-400">
            Run <code className="bg-gray-100 px-2 py-1 rounded">recoder auth login</code> to create a session
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <div key={session.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-3 h-3 rounded-full ${
                      session.status === 'authorized' ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                    <h3 className="font-semibold text-lg">
                      {session.deviceInfo?.platform || 'Unknown Device'}
                    </h3>
                  </div>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p>Created: {new Date(session.createdAt).toLocaleString()}</p>
                    {session.lastUsedAt && (
                      <p>Last used: {new Date(session.lastUsedAt).toLocaleString()}</p>
                    )}
                    {session.ipAddress && (
                      <p>IP: {session.ipAddress}</p>
                    )}
                    {session.tokenExpiresAt && (
                      <p>Expires: {new Date(session.tokenExpiresAt).toLocaleString()}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => revokeSession(session.id)}
                  className="text-red-600 hover:text-red-800 font-semibold"
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getAuthToken() {
  return localStorage.getItem('auth_token') || '';
}
```

## 📦 Required Dependencies

```bash
cd app
pnpm add recharts date-fns
```

## 🔗 API Endpoint Reference

All endpoints are prefixed with `http://localhost:3001` (or your backend URL).

### Authentication Required
All endpoints require `Authorization: Bearer <token>` header except:
- `POST /api/auth/cli/authorize`
- `GET /api/auth/cli/token`

### Quick Reference
```typescript
// CLI Auth
POST   /api/auth/cli/authorize              - Start auth
GET    /api/auth/cli/token?deviceCode=xxx   - Poll
POST   /api/auth/cli/verify-code            - Verify code
POST   /api/auth/cli/authorize-session      - Authorize
GET    /api/auth/cli/sessions                - List sessions
DELETE /api/auth/cli/session/:id            - Revoke

// Premium
GET    /api/premium/status                   - Get status
POST   /api/premium/api-key                  - Generate key
GET    /api/premium/api-keys                 - List keys
DELETE /api/premium/api-key/:id              - Delete key

// Usage Analytics
GET    /api/usage-analytics                  - Get analytics
GET    /api/usage-analytics/cost             - Cost breakdown
POST   /api/usage-analytics/export           - Export data
```

## 🎨 Design Guidelines

### Color Scheme
- Primary: Blue (`#3b82f6`)
- Success: Green (`#10b981`)
- Warning: Yellow (`#fbbf24`)
- Danger: Red (`#ef4444`)
- Gray Scale: Tailwind defaults

### Typography
- Headings: Bold, large size
- Body: Regular weight
- Code: Mono font
- Numbers: Tabular nums for alignment

### Components
- Use Tailwind CSS utility classes
- Consistent spacing (6, 4, 2 units)
- Shadow for elevation
- Rounded corners for cards
- Hover states on interactive elements

## ⚡ Quick Start

1. **Start Backend**:
```bash
cd backend
npm run dev
```

2. **Start Frontend**:
```bash
cd app
npm run dev
```

3. **Test Flow**:
   - Open browser to `http://localhost:3000`
   - Navigate to settings/premium
   - Generate API key
   - View usage dashboard

## 🧪 Testing Checklist

- [ ] CLI authorization page loads
- [ ] Can authorize/deny CLI access
- [ ] Premium settings show correct data
- [ ] Can generate API keys
- [ ] Can revoke API keys
- [ ] Usage charts render correctly
- [ ] Export functionality works
- [ ] CLI sessions list displays
- [ ] Can revoke individual sessions
- [ ] Can revoke all sessions

## 📞 Need Help?

Check these documents:
- `CLI_AUTH_AND_PREMIUM_IMPLEMENTATION_PLAN.md` - Full plan
- `BACKEND_IMPLEMENTATION_COMPLETE.md` - Backend details
- `IMPLEMENTATION_COMPLETE_SUMMARY.md` - Overall summary

---

**Ready to build!** All backend APIs are tested and working. Start with the CLI authorization page and work your way through the priorities.
