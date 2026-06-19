'use client';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type OssComponentStatus = string;

type OssComponentSummary = {
  id?: string;
  componentId?: string;
  name: string;
  contract: string;
  owner?: string;
  status: OssComponentStatus;
  risk?: 'low' | 'medium' | 'high';
  canExecuteCode?: boolean;
  canTouchProduction?: boolean;
};

const FALLBACK_COMPONENTS: OssComponentSummary[] = [
  { id: 'beads-adapter', name: 'Beads Adapter', contract: 'TaskGraph', owner: 'agent-os', status: 'active', risk: 'low' },
  { id: 'git-nexus', name: 'Git Nexus', contract: 'RepoIntelligence', owner: 'agent-os', status: 'active', risk: 'low' },
  { id: 'pal', name: 'PAL Planner', contract: 'Planner', owner: 'agent-os', status: 'active', risk: 'low' },
  { id: 'recoder-mcp', name: 'Recoder MCP', contract: 'McpServer', owner: 'agent-os', status: 'active', risk: 'high' },
  { id: 'recoder-a2a', name: 'Recoder A2A', contract: 'A2AAgent', owner: 'agent-os', status: 'active', risk: 'medium' },
  { id: 'agent-runtimes', name: 'Runtime Adapters', contract: 'RuntimeAdapter', owner: 'runtime', status: 'active', risk: 'high' },
  { id: 'playwright-mcp', name: 'Playwright MCP', contract: 'BrowserVerifier', owner: 'runtime', status: 'active', risk: 'medium' },
  { id: 'daytona', name: 'Daytona', contract: 'SandboxProvider', owner: 'runtime', status: 'active', risk: 'high' },
  { id: 'context7', name: 'Context7', contract: 'InstructionSource', owner: 'agent-os', status: 'experimental', risk: 'low' },
  { id: 'mem0', name: 'mem0', contract: 'MemoryProvider', owner: 'agent-os', status: 'experimental', risk: 'medium' },
  { id: 'openclaw-derived', name: 'OpenClaw Derived', contract: 'RuntimeAdapter', owner: 'runtime', status: 'vendored', risk: 'high' },
  { id: 'openziti-zrok', name: 'OpenZiti/zrok', contract: 'DeploymentProvider', owner: 'infra', status: 'needs-contract', risk: 'high' },
];

function riskVariant(risk: OssComponentSummary['risk']) {
  if (risk === 'high') return 'destructive';
  if (risk === 'medium') return 'secondary';
  return 'outline';
}

function displayRisk(component: OssComponentSummary): 'low' | 'medium' | 'high' {
  if (component.risk) return component.risk;
  if (component.canTouchProduction || component.canExecuteCode) return 'high';
  return 'low';
}

export function OssComponentRegistry({
  components,
}: {
  components?: OssComponentSummary[];
}) {
  const visibleComponents =
    components && components.length > 0 ? components : FALLBACK_COMPONENTS;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">OSS Component Registry</CardTitle>
        <CardDescription>
          Agent OS components must declare a contract, owner, status, and security risk before they become runtime dependencies.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleComponents.map((component) => {
            const risk = displayRisk(component);
            const componentId = component.componentId ?? component.id ?? component.name;
            return (
            <div key={componentId} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{component.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{component.contract}</p>
                </div>
                <Badge variant="outline" className="rounded px-2 py-0.5 text-[11px]">
                  {component.status}
                </Badge>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Owner: {component.owner ?? 'unassigned'}</span>
                <Badge variant={riskVariant(risk)} className="rounded px-2 py-0.5 text-[11px]">
                  {risk} risk
                </Badge>
              </div>
            </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
