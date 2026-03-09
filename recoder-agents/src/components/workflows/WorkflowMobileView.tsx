'use client';

import { useState } from 'react';
import { useWorkflow } from '@/hooks/workflows/use-workflows';
import type { WorkflowNode } from '@/lib/api/workflows';
import { cn } from '@/lib/utils';
import {
  Bot, Wrench, GitBranch, Repeat, Columns, Clock,
  ShieldCheck, ArrowDownToLine, ArrowUpFromLine,
  ChevronDown, ChevronRight, Check, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const NODE_ICONS: Record<string, typeof Bot> = {
  agent: Bot,
  tool: Wrench,
  condition: GitBranch,
  loop: Repeat,
  parallel: Columns,
  delay: Clock,
  approval: ShieldCheck,
  input: ArrowDownToLine,
  output: ArrowUpFromLine,
};

const NODE_COLORS: Record<string, string> = {
  agent: 'border-blue-500/30 bg-blue-500/5',
  tool: 'border-orange-500/30 bg-orange-500/5',
  condition: 'border-purple-500/30 bg-purple-500/5',
  loop: 'border-cyan-500/30 bg-cyan-500/5',
  parallel: 'border-teal-500/30 bg-teal-500/5',
  delay: 'border-amber-500/30 bg-amber-500/5',
  approval: 'border-emerald-500/30 bg-emerald-500/5',
  input: 'border-sky-500/30 bg-sky-500/5',
  output: 'border-rose-500/30 bg-rose-500/5',
};

export function WorkflowMobileView({ workflowId }: { workflowId: string }) {
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  if (!workflow || !workflow.nodes.length) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        No nodes in this workflow yet
      </div>
    );
  }

  // Sort nodes by position_y (top to bottom)
  const sortedNodes = [...workflow.nodes].sort((a, b) => a.position_y - b.position_y);

  return (
    <div className="space-y-2 p-4">
      {sortedNodes.map((node, index) => {
        const Icon = NODE_ICONS[node.node_type] || Bot;
        const colorClass = NODE_COLORS[node.node_type] || 'border-border bg-card';
        const isExpanded = expandedNodes.has(node.id);

        return (
          <div key={node.id}>
            {/* Connecting line */}
            {index > 0 && (
              <div className="flex justify-center -my-1 mb-1">
                <div className="w-0.5 h-4 bg-border" />
              </div>
            )}
            {/* Node card */}
            <button
              onClick={() => toggleNode(node.id)}
              className={cn(
                'w-full rounded-xl border p-4 text-left transition-colors',
                colorClass,
                'active:scale-[0.98] touch-manipulation'
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{node.label}</div>
                  <Badge variant="secondary" className="text-[10px] mt-1">
                    {node.node_type}
                  </Badge>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                  {node.node_type === 'approval' && (
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" className="flex-1 min-h-[48px]">
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 min-h-[48px]">
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                  {Object.keys(node.config).length > 0 && (
                    <pre className="mt-2 p-2 bg-muted rounded text-[11px] overflow-x-auto">
                      {JSON.stringify(node.config, null, 2)}
                    </pre>
                  )}
                  {Object.keys(node.config).length === 0 && (
                    <span>No configuration</span>
                  )}
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
