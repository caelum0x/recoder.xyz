'use client';

import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Activity, DollarSign, TrendingUp, Zap } from 'lucide-react';

interface UsageMetricsProps {
  usage: any;
  limits: any;
}

export default function UsageMetrics({ usage, limits }: UsageMetricsProps) {
  const todayRequests = usage?.today?.requests || 0;
  const monthRequests = usage?.month?.requests || 0;
  const dailyLimit = limits?.dailyRequests || 10;
  const monthlyLimit = limits?.monthlyRequests || 100;
  const dailyPercentage = Math.min((todayRequests / dailyLimit) * 100, 100);
  const monthlyPercentage = Math.min((monthRequests / monthlyLimit) * 100, 100);

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Activity className="w-5 h-5 text-blue-600" />
        Usage Overview
      </h2>
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Today</span>
            <span className="text-sm text-gray-600">{todayRequests} / {dailyLimit === -1 ? '∞' : dailyLimit}</span>
          </div>
          <Progress value={dailyPercentage} className="h-2" />
          <p className="text-xs text-gray-600 mt-1">{dailyLimit - todayRequests} remaining today</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">This Month</span>
            <span className="text-sm text-gray-600">{monthRequests} / {monthlyLimit === -1 ? '∞' : monthlyLimit}</span>
          </div>
          <Progress value={monthlyPercentage} className="h-2" />
          <p className="text-xs text-gray-600 mt-1">{monthlyLimit - monthRequests} remaining</p>
        </div>
        <div className="pt-4 border-t space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Today's Cost</span>
            </div>
            <span className="text-sm font-bold text-gray-900">${(usage?.today?.cost || 0).toFixed(4)}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Monthly Cost</span>
            </div>
            <span className="text-sm font-bold text-gray-900">${(usage?.month?.cost || 0).toFixed(4)}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Total Tokens</span>
            </div>
            <span className="text-sm font-bold text-gray-900">{(usage?.month?.tokens || 0).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
