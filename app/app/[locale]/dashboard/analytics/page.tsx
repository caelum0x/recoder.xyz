"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  DollarSign,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useSession } from "@/lib/session-provider";

interface AnalyticsResponse {
  data?: {
    summary?: {
      totalRequests?: number;
      totalTokens?: number;
      totalCost?: number;
      avgDailyRequests?: number;
      avgDailyCost?: number | string;
    };
    chartData?: Array<{
      date: string;
      requests: number;
      tokens: number;
      cost: number;
    }>;
    usageByModel?: Array<{
      model: string;
      requests: number;
      tokens: number;
      cost: number;
    }>;
    insights?: {
      trend?: string;
      message?: string;
      recommendations?: string[];
    };
  };
}

export default function AdvancedAnalyticsDashboard() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [analytics, setAnalytics] = useState<AnalyticsResponse["data"] | null>(null);
  const redirectToSignIn = () => {
    const currentPath = typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/dashboard/analytics";
    router.push(`/auth/signin?redirect=${encodeURIComponent(currentPath)}`);
  };

  useEffect(() => {
    if (!isPending && !session) {
      redirectToSignIn();
      return;
    }

    if (!isPending && session) {
      void loadAnalytics();
    }
  }, [timeRange, isPending, session]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/dashboard/analytics?period=${timeRange}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload: AnalyticsResponse = await response.json();
      setAnalytics(payload.data || null);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Failed to load analytics:", error);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  const summary = analytics?.summary;
  const usageByModel = analytics?.usageByModel || [];
  const chartData = analytics?.chartData || [];
  const insights = analytics?.insights;

  const formatNumber = (value: number) => value.toLocaleString();
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);

  if (isPending || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Analytics</h1>
            <p className="text-gray-400 mt-1">Real usage from your Recoder account.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void loadAnalytics()}
              className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5 text-gray-300" />
            </button>
            <div className="text-sm text-gray-500">Updated: {lastUpdate.toLocaleTimeString()}</div>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as "7d" | "30d" | "90d")}
              className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-white"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Total Requests</span>
              <Activity className="w-5 h-5 text-orange-400" />
            </div>
            <div className="text-3xl font-bold">{formatNumber(summary?.totalRequests || 0)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Total Tokens</span>
              <Zap className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-3xl font-bold">{formatNumber(summary?.totalTokens || 0)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Total Cost</span>
              <DollarSign className="w-5 h-5 text-green-400" />
            </div>
            <div className="text-3xl font-bold">{formatCurrency(summary?.totalCost || 0)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Avg Daily Requests</span>
              <Activity className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-3xl font-bold">{formatNumber(summary?.avgDailyRequests || 0)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold mb-4">Usage by Model</h2>
            {usageByModel.length === 0 ? (
              <p className="text-gray-400">No model usage recorded for this period.</p>
            ) : (
              <div className="space-y-3">
                {usageByModel.map((item) => (
                  <div key={item.model} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4">
                    <div>
                      <div className="font-medium">{item.model}</div>
                      <div className="text-sm text-gray-400">{formatNumber(item.requests)} requests</div>
                    </div>
                    <div className="text-right">
                      <div>{formatNumber(item.tokens)} tokens</div>
                      <div className="text-sm text-gray-400">{formatCurrency(item.cost || 0)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold mb-4">Daily Activity</h2>
            {chartData.length === 0 ? (
              <p className="text-gray-400">No activity recorded for this period.</p>
            ) : (
              <div className="space-y-3">
                {chartData.slice(-10).map((item) => (
                  <div key={item.date} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4">
                    <div>
                      <div className="font-medium">{item.date}</div>
                      <div className="text-sm text-gray-400">{formatNumber(item.requests)} requests</div>
                    </div>
                    <div className="text-right">
                      <div>{formatNumber(item.tokens)} tokens</div>
                      <div className="text-sm text-gray-400">{formatCurrency(item.cost || 0)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold mb-4">Insights</h2>
          {insights ? (
            <div className="space-y-2">
              <p className="text-gray-300">{insights.message || "No insight summary available."}</p>
              {(insights.recommendations || []).length > 0 ? (
                <ul className="list-disc pl-6 text-gray-400 space-y-1">
                  {(insights.recommendations || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400">No recommendations for this period.</p>
              )}
            </div>
          ) : (
            <p className="text-gray-400">No insights available yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
