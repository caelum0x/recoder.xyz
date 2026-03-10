'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Minus, Plus, Equal, ArrowLeftRight } from 'lucide-react';
import type { AgentDiffField } from '@/lib/api/agent-clone';

interface AgentDiffViewProps {
  agentAName: string;
  agentBName: string;
  differences: AgentDiffField[];
  className?: string;
  compact?: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  instructions: 'Instructions',
  model: 'Model',
  model_provider: 'Model Provider',
  agentpress_tools: 'Tools',
  configured_mcps: 'MCP Servers',
  custom_mcps: 'Custom MCPs',
  icon_name: 'Icon',
  icon_color: 'Icon Color',
  icon_background: 'Icon Background',
};

function DiffBadge({ type }: { type: string }) {
  switch (type) {
    case 'modified':
      return (
        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
          <ArrowLeftRight className="h-3 w-3 mr-1" />
          Changed
        </Badge>
      );
    case 'added':
      return (
        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
          <Plus className="h-3 w-3 mr-1" />
          Added
        </Badge>
      );
    case 'removed':
      return (
        <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
          <Minus className="h-3 w-3 mr-1" />
          Removed
        </Badge>
      );
    case 'same':
      return (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          <Equal className="h-3 w-3 mr-1" />
          Same
        </Badge>
      );
    default:
      return null;
  }
}

function formatValue(value: any, field: string): string {
  if (value === null || value === undefined) return '(empty)';

  if (field === 'instructions') {
    const text = String(value);
    if (text.length > 200) return text.slice(0, 200) + '...';
    return text;
  }

  if (typeof value === 'object') {
    if (field === 'agentpress_tools') {
      const keys = Object.keys(value);
      const enabled = keys.filter((k) => {
        const v = value[k];
        return v === true || v?.enabled === true;
      });
      return enabled.length > 0 ? enabled.join(', ') : '(none enabled)';
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '(none)';
      return value.map((v) => (typeof v === 'object' ? v.name || JSON.stringify(v) : String(v))).join(', ');
    }

    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function DiffRow({
  field,
  agentAName,
  agentBName,
  compact,
}: {
  field: AgentDiffField;
  agentAName: string;
  agentBName: string;
  compact?: boolean;
}) {
  const label = FIELD_LABELS[field.field] || field.field;
  const isSame = field.type === 'same';

  if (compact && isSame) return null;

  return (
    <div
      className={cn(
        'border rounded-lg p-3',
        field.type === 'modified' && 'border-amber-200 dark:border-amber-800',
        field.type === 'added' && 'border-green-200 dark:border-green-800',
        field.type === 'removed' && 'border-red-200 dark:border-red-800',
        isSame && 'border-border/50'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <DiffBadge type={field.type} />
      </div>

      {!isSame && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">{agentAName}</div>
            <div
              className={cn(
                'text-xs font-mono bg-muted/50 rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap break-words',
                field.type === 'removed' && 'bg-red-50 dark:bg-red-950/30'
              )}
            >
              {formatValue(field.value_a, field.field)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">{agentBName}</div>
            <div
              className={cn(
                'text-xs font-mono bg-muted/50 rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap break-words',
                field.type === 'added' && 'bg-green-50 dark:bg-green-950/30'
              )}
            >
              {formatValue(field.value_b, field.field)}
            </div>
          </div>
        </div>
      )}

      {isSame && !compact && (
        <div className="text-xs text-muted-foreground font-mono bg-muted/30 rounded p-2 max-h-20 overflow-auto whitespace-pre-wrap break-words">
          {formatValue(field.value_a, field.field)}
        </div>
      )}
    </div>
  );
}

export function AgentDiffView({
  agentAName,
  agentBName,
  differences,
  className,
  compact = false,
}: AgentDiffViewProps) {
  const changedCount = differences.filter((d) => d.type !== 'same').length;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {changedCount === 0
            ? 'No differences found'
            : `${changedCount} field${changedCount !== 1 ? 's' : ''} differ`}
        </span>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span>{agentAName}</span>
          <ArrowLeftRight className="h-3 w-3" />
          <span>{agentBName}</span>
        </div>
      </div>

      <div className="space-y-2">
        {differences.map((field) => (
          <DiffRow
            key={field.field}
            field={field}
            agentAName={agentAName}
            agentBName={agentBName}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

export default AgentDiffView;
