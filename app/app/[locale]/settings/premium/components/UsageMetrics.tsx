'use client';

import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Bot, Boxes, CheckCircle2, Rocket, ShieldCheck } from 'lucide-react';

interface UsageMetricsProps {
  usage: any;
  limits: any;
}

export default function UsageMetrics({ usage, limits }: UsageMetricsProps) {
  const entitlements = limits?.entitlements || limits || {};
  const workspaceLimit = entitlements.workspaces ?? limits?.workspaces ?? 1;
  const agentLimit = entitlements.connectedAgents ?? limits?.connectedAgents ?? 1;
  const previewLimit = entitlements.previewDeploysPerMonth ?? limits?.previewDeploysPerMonth ?? 3;
  const retentionDays = entitlements.artifactRetentionDays ?? limits?.artifactRetentionDays ?? 7;
  const workspacesUsed = usage?.workspaces?.used ?? usage?.spacesUsed ?? 0;
  const agentsUsed = usage?.connectedAgents?.used ?? usage?.connectedAgentsUsed ?? 0;
  const previewsUsed = usage?.previewDeploys?.used ?? usage?.previewDeploysUsed ?? 0;

  const percent = (used: number, limit: number) => {
    if (limit >= 999 || limit <= 0) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const label = (used: number, limit: number) => `${used} / ${limit >= 999 ? 'Unlimited' : limit}`;

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Boxes className="w-5 h-5 text-blue-600" />
        Plan Capacity
      </h2>
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Spaces</span>
            <span className="text-sm text-gray-600">{label(workspacesUsed, workspaceLimit)}</span>
          </div>
          <Progress value={percent(workspacesUsed, workspaceLimit)} className="h-2" />
          <p className="text-xs text-gray-600 mt-1">Primary signed-in conversion path</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Connected agents</span>
            <span className="text-sm text-gray-600">{label(agentsUsed, agentLimit)}</span>
          </div>
          <Progress value={percent(agentsUsed, agentLimit)} className="h-2" />
          <p className="text-xs text-gray-600 mt-1">First activation milestone</p>
        </div>
        <div className="pt-4 border-t space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Rocket className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Preview deploys</span>
            </div>
            <span className="text-sm font-bold text-gray-900">{label(previewsUsed, previewLimit)}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Approval workflow</span>
            </div>
            <span className="text-sm font-bold text-gray-900 capitalize">{entitlements.approvalWorkflows || 'single'}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Artifact retention</span>
            </div>
            <span className="text-sm font-bold text-gray-900">{retentionDays} days</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
