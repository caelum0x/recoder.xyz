'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Bot, Wrench, GitBranch, Repeat, Layers, Timer, ShieldCheck, LogIn, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowNode } from '@/lib/api/workflows';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkflowNodeConfigProps {
  node: WorkflowNode | null;
  onClose: () => void;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
}

// ---------------------------------------------------------------------------
// Node type metadata
// ---------------------------------------------------------------------------

const nodeTypeMeta: Record<
  WorkflowNode['node_type'],
  { label: string; color: string; icon: React.ElementType }
> = {
  agent: { label: 'Agent', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', icon: Bot },
  tool: { label: 'Tool', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: Wrench },
  condition: { label: 'Condition', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: GitBranch },
  loop: { label: 'Loop', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300', icon: Repeat },
  parallel: { label: 'Parallel', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300', icon: Layers },
  delay: { label: 'Delay', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', icon: Timer },
  approval: { label: 'Approval', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', icon: ShieldCheck },
  input: { label: 'Input', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: LogIn },
  output: { label: 'Output', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300', icon: LogOut },
};

// ---------------------------------------------------------------------------
// Shared form field helpers
// ---------------------------------------------------------------------------

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
      {children}
    </label>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-blue-700/30"
    />
  );
}

function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-blue-700/30"
    />
  );
}

function NumberInput({
  id,
  value,
  onChange,
  min,
  placeholder,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      placeholder={placeholder}
      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-blue-700/30"
    />
  );
}

function SelectInput({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-blue-700/30"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Node-type-specific config forms
// ---------------------------------------------------------------------------

function AgentConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <>
      <div>
        <FieldLabel htmlFor="agent-id">Agent ID</FieldLabel>
        <TextInput
          id="agent-id"
          value={(config.agent_id as string) ?? ''}
          onChange={(v) => onChange({ ...config, agent_id: v })}
          placeholder="Enter agent ID"
        />
      </div>
      <div>
        <FieldLabel htmlFor="agent-prompt">Prompt</FieldLabel>
        <TextArea
          id="agent-prompt"
          value={(config.prompt as string) ?? ''}
          onChange={(v) => onChange({ ...config, prompt: v })}
          placeholder="System prompt for this agent step"
          rows={4}
        />
      </div>
      <div>
        <FieldLabel htmlFor="agent-model">Model</FieldLabel>
        <TextInput
          id="agent-model"
          value={(config.model as string) ?? ''}
          onChange={(v) => onChange({ ...config, model: v })}
          placeholder="e.g. gpt-4o, claude-sonnet-4-20250514"
        />
      </div>
    </>
  );
}

function ConditionConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <div>
      <FieldLabel htmlFor="condition-expr">JSONPath Expression</FieldLabel>
      <TextInput
        id="condition-expr"
        value={(config.expression as string) ?? ''}
        onChange={(v) => onChange({ ...config, expression: v })}
        placeholder="$.result.status == 'success'"
      />
    </div>
  );
}

function DelayConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <div>
      <FieldLabel htmlFor="delay-duration">Duration (seconds)</FieldLabel>
      <div className="flex items-center gap-2">
        <NumberInput
          id="delay-duration"
          value={(config.duration_seconds as number) ?? 0}
          onChange={(v) => onChange({ ...config, duration_seconds: v })}
          min={0}
          placeholder="30"
        />
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">sec</span>
      </div>
    </div>
  );
}

function ApprovalConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <>
      <div>
        <FieldLabel htmlFor="approval-ttl">TTL (seconds)</FieldLabel>
        <NumberInput
          id="approval-ttl"
          value={(config.ttl_seconds as number) ?? 3600}
          onChange={(v) => onChange({ ...config, ttl_seconds: v })}
          min={0}
          placeholder="3600"
        />
      </div>
      <div>
        <FieldLabel htmlFor="approval-context">Context Description</FieldLabel>
        <TextArea
          id="approval-context"
          value={(config.context_description as string) ?? ''}
          onChange={(v) => onChange({ ...config, context_description: v })}
          placeholder="Describe what is being approved"
        />
      </div>
    </>
  );
}

function ToolConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const [toolConfigJson, setToolConfigJson] = useState(
    JSON.stringify(config.tool_config ?? {}, null, 2),
  );

  return (
    <>
      <div>
        <FieldLabel htmlFor="tool-name">Tool Name</FieldLabel>
        <TextInput
          id="tool-name"
          value={(config.tool_name as string) ?? ''}
          onChange={(v) => onChange({ ...config, tool_name: v })}
          placeholder="e.g. web_search, code_interpreter"
        />
      </div>
      <div>
        <FieldLabel htmlFor="tool-config-json">Tool Config (JSON)</FieldLabel>
        <TextArea
          id="tool-config-json"
          value={toolConfigJson}
          onChange={(v) => {
            setToolConfigJson(v);
            try {
              const parsed = JSON.parse(v);
              onChange({ ...config, tool_config: parsed });
            } catch {
              // Don't update config with invalid JSON
            }
          }}
          placeholder='{ "key": "value" }'
          rows={4}
        />
      </div>
    </>
  );
}

function InputConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <div>
      <FieldLabel htmlFor="input-prompt">Prompt Text</FieldLabel>
      <TextInput
        id="input-prompt"
        value={(config.prompt as string) ?? ''}
        onChange={(v) => onChange({ ...config, prompt: v })}
        placeholder="Enter input prompt"
      />
    </div>
  );
}

function OutputConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <div>
      <FieldLabel htmlFor="output-format">Output Format</FieldLabel>
      <SelectInput
        id="output-format"
        value={(config.format as string) ?? 'markdown'}
        onChange={(v) => onChange({ ...config, format: v })}
        options={[
          { value: 'markdown', label: 'Markdown' },
          { value: 'json', label: 'JSON' },
          { value: 'text', label: 'Plain Text' },
        ]}
      />
    </div>
  );
}

function LoopParallelConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <div>
      <FieldLabel htmlFor="max-iterations">Max Iterations</FieldLabel>
      <NumberInput
        id="max-iterations"
        value={(config.max_iterations as number) ?? 10}
        onChange={(v) => onChange({ ...config, max_iterations: v })}
        min={1}
        placeholder="10"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config form dispatcher
// ---------------------------------------------------------------------------

function NodeTypeConfig({
  nodeType,
  config,
  onChange,
}: {
  nodeType: WorkflowNode['node_type'];
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  switch (nodeType) {
    case 'agent':
      return <AgentConfig config={config} onChange={onChange} />;
    case 'condition':
      return <ConditionConfig config={config} onChange={onChange} />;
    case 'delay':
      return <DelayConfig config={config} onChange={onChange} />;
    case 'approval':
      return <ApprovalConfig config={config} onChange={onChange} />;
    case 'tool':
      return <ToolConfig config={config} onChange={onChange} />;
    case 'input':
      return <InputConfig config={config} onChange={onChange} />;
    case 'output':
      return <OutputConfig config={config} onChange={onChange} />;
    case 'loop':
    case 'parallel':
      return <LoopParallelConfig config={config} onChange={onChange} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkflowNodeConfig({ node, onClose, onUpdate }: WorkflowNodeConfigProps) {
  const [label, setLabel] = useState('');
  const [config, setConfig] = useState<Record<string, unknown>>({});

  // Sync local state when the selected node changes
  useEffect(() => {
    if (node) {
      setLabel(node.label);
      setConfig({ ...node.config });
    }
  }, [node]);

  const handleApply = useCallback(() => {
    if (!node) return;
    onUpdate(node.id, { label, config });
  }, [node, label, config, onUpdate]);

  if (!node) return null;

  const meta = nodeTypeMeta[node.node_type];
  const Icon = meta.icon;

  return (
    <div className="flex h-full w-80 flex-col border-l border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded',
              meta.color,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', meta.color)}>
            {meta.label}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label="Close config panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Common label field */}
        <div>
          <FieldLabel htmlFor="node-label">Label</FieldLabel>
          <TextInput
            id="node-label"
            value={label}
            onChange={setLabel}
            placeholder="Node label"
          />
        </div>

        {/* Type-specific fields */}
        <NodeTypeConfig nodeType={node.node_type} config={config} onChange={setConfig} />
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <button
          type="button"
          onClick={handleApply}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-700/50"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
