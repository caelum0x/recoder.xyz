import { useState } from 'react';
import { json, redirect, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData, useRouteError, isRouteErrorResponse } from '@remix-run/react';
import { SystemMonitor } from '~/components/admin/SystemMonitor';
import { OptimizationDashboard } from '~/components/analytics/OptimizationDashboard';
import { AnalyticsDashboardView } from '~/components/admin/AnalyticsDashboardView';
import { AdminHealthSummary } from '~/components/admin/AdminHealthSummary';

function isAdminUser(userId: string | null, env: Record<string, string | undefined>): boolean {
  if (!userId) return false;
  const adminIds = (env.ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
  if (adminIds.length === 0) return true; // No admin list configured = allow all (dev mode)
  return adminIds.includes(userId);
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = (context as any)?.cloudflare?.env || process.env as unknown as Record<string, string | undefined>;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || request.headers.get('x-user-id');

  if (!isAdminUser(userId, env)) {
    throw redirect('/');
  }

  return json({ isAdmin: true });
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-recoder-elements-background-depth-1">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-recoder-elements-textPrimary mb-2">{error.status}</h1>
          <p className="text-recoder-elements-textSecondary mb-4">{error.statusText || 'Access Denied'}</p>
          <a href="/" className="text-blue-500 hover:underline">Back to App</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-recoder-elements-background-depth-1">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-recoder-elements-textPrimary mb-2">Error</h1>
        <p className="text-recoder-elements-textSecondary mb-4">Something went wrong loading the admin dashboard.</p>
        <a href="/" className="text-blue-500 hover:underline">Back to App</a>
      </div>
    </div>
  );
}

type Tab = 'analytics' | 'usage' | 'system';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('analytics');

  return (
    <div className="min-h-screen bg-recoder-elements-background-depth-1">
      {/* Header */}
      <div className="bg-recoder-elements-background-depth-2 border-b border-recoder-elements-borderColor">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-recoder-elements-textPrimary">Admin Dashboard</h1>
              <p className="text-sm text-recoder-elements-textSecondary">API usage, costs, and system health</p>
            </div>
            <div className="flex items-center gap-3">
              <AdminHealthSummary onClick={() => setActiveTab('system')} />
              <a
                href="/"
                className="px-4 py-2 bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text rounded-lg hover:bg-recoder-elements-button-primary-backgroundHover"
              >
                Back to App
              </a>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'analytics'
                  ? 'bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text'
                  : 'text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-item-backgroundActive'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="i-ph:chart-line-up" />
                Analytics & Costs
              </div>
            </button>
            <button
              onClick={() => setActiveTab('usage')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'usage'
                  ? 'bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text'
                  : 'text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-item-backgroundActive'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="i-ph:chart-bar" />
                Usage Analytics
              </div>
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'system'
                  ? 'bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text'
                  : 'text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-item-backgroundActive'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="i-ph:heartbeat" />
                System Health
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === 'analytics' && <OptimizationDashboard />}
        {activeTab === 'usage' && <AnalyticsDashboardView />}
        {activeTab === 'system' && <SystemMonitor />}
      </div>
    </div>
  );
}
