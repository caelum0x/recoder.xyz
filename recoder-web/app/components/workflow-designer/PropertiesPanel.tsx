'use client';

import { useCallback, useMemo } from 'react';
import classNames from 'classnames';
import { useEditorStore, useEditorStoreWithEqualityFn } from './store';
import { NodeIcon, CloseIcon } from './icons';
import { EditableText } from './ui/EditableText';
import { Button } from './ui/Button';
import type { WorkflowNode, NodeId } from './types';
import { getDefaultNodeName } from './types';

// Panel spacing constants
const PANEL_SPACING = {
  HEADER: {
    HEIGHT: 'h-12',
    ICON_SIZE: '28px',
    ICON_GAP: 'gap-2',
  },
  CONTENT: {
    PADDING: 'p-4',
    GAP: 'gap-4',
  },
};

// Get icon background color based on node content type
function getNodeIconBackground(node: WorkflowNode): string {
  switch (node.content.type) {
    case 'textGeneration':
      return 'bg-purple-500';
    case 'imageGeneration':
      return 'bg-pink-500';
    case 'codeExecution':
      return 'bg-amber-500';
    case 'apiCall':
      return 'bg-cyan-500';
    case 'conditional':
      return 'bg-orange-500';
    case 'loop':
      return 'bg-teal-500';
    case 'trigger':
      return 'bg-yellow-500';
    case 'action':
      return 'bg-red-500';
    case 'query':
      return 'bg-sky-500';
    case 'text':
      return 'bg-emerald-500';
    case 'file':
      return 'bg-blue-500';
    case 'prompt':
      return 'bg-violet-500';
    case 'variable':
      return 'bg-indigo-500';
    case 'output':
      return 'bg-rose-500';
    default:
      return 'bg-recoder-elements-background-depth-3';
  }
}

// Properties Panel Header
function PropertiesPanelHeader({
  node,
  onChangeName,
  onClose,
}: {
  node: WorkflowNode;
  onChangeName?: (name?: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className={classNames(
        PANEL_SPACING.HEADER.HEIGHT,
        'flex justify-between items-center px-4 shrink-0',
        'border-b border-recoder-elements-borderColor'
      )}
    >
      <div className={`flex flex-1 min-w-0 ${PANEL_SPACING.HEADER.ICON_GAP} items-center`}>
        <div
          className={classNames(
            getNodeIconBackground(node),
            'rounded-lg flex items-center justify-center'
          )}
          style={{
            width: PANEL_SPACING.HEADER.ICON_SIZE,
            height: PANEL_SPACING.HEADER.ICON_SIZE,
          }}
        >
          <NodeIcon node={node} className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <EditableText
            className="block w-full rounded-lg bg-recoder-elements-background-depth-2/50 hover:bg-recoder-elements-background-depth-3"
            inputClassName="px-2 py-1"
            buttonClassName="px-2 py-1"
            onValueChange={(value) => {
              const defaultName = getDefaultNodeName(node);
              if (value === defaultName || value.trim().length === 0) {
                onChangeName?.();
                return;
              }
              onChangeName?.(value);
            }}
            text={getDefaultNodeName(node)}
          />
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="ml-2"
      >
        <CloseIcon className="w-4 h-4" />
      </Button>
    </div>
  );
}

// Properties Panel Content
function PropertiesPanelContent({ children }: { children: React.ReactNode }) {
  return (
    <div className={classNames('flex-1 flex flex-col min-h-0 overflow-y-auto', PANEL_SPACING.CONTENT.PADDING)}>
      {children}
    </div>
  );
}

// Section component for grouping properties
function PropertySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-recoder-elements-textTertiary uppercase tracking-wider">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// Property row component
function PropertyRow({
  label,
  value,
  editable = false,
  onChange,
}: {
  label: string;
  value?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-recoder-elements-textTertiary">{label}</label>
      {editable ? (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          className="px-3 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-sm text-recoder-elements-textPrimary
                     focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500"
        />
      ) : (
        <span className="text-sm text-recoder-elements-textPrimary">{value || '-'}</span>
      )}
    </div>
  );
}

// Text area for longer content
function PropertyTextArea({
  label,
  value,
  placeholder,
  onChange,
  rows = 4,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-recoder-elements-textTertiary">{label}</label>
      <textarea
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="px-3 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-sm text-recoder-elements-textPrimary
                   resize-none focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500"
      />
    </div>
  );
}

// Main Properties Panel Component
export function PropertiesPanel() {
  const inspectedNodeId = useEditorStore((s) => s.ui.inspectedNodeId);
  const setInspectedNodeId = useEditorStore((s) => s.setInspectedNodeId);

  const { node, updateNode } = useEditorStoreWithEqualityFn(
    (s) => ({
      node: inspectedNodeId
        ? s.nodes.find((n) => n.id === inspectedNodeId)
        : undefined,
      updateNode: s.updateNode,
    }),
    (a, b) => a.node === b.node
  );

  const handleClose = useCallback(() => {
    setInspectedNodeId(undefined);
  }, [setInspectedNodeId]);

  const handleChangeName = useCallback(
    (name?: string) => {
      if (!node) return;
      if (typeof name === 'string' && name.trim().length > 0) {
        updateNode(node.id as NodeId, { name });
        return;
      }
      updateNode(node.id as NodeId, { name: undefined });
    },
    [node, updateNode]
  );

  const handleUpdateContent = useCallback(
    (key: string, value: string) => {
      if (!node) return;
      updateNode(node.id as NodeId, {
        content: { ...node.content, [key]: value },
      });
    },
    [node, updateNode]
  );

  // Hide when nothing is selected
  if (!inspectedNodeId || !node) return null;

  return (
    <aside
      className={classNames(
        'w-[360px] shrink-0 border-l border-recoder-elements-borderColor h-full overflow-hidden',
        'bg-recoder-elements-background-depth-1/95 backdrop-blur-sm flex flex-col'
      )}
      aria-label="Properties Panel"
    >
      <PropertiesPanelHeader
        node={node}
        onChangeName={handleChangeName}
        onClose={handleClose}
      />

      <PropertiesPanelContent>
        {/* Basic Info Section */}
        <PropertySection title="Basic Info">
          <PropertyRow label="Type" value={node.content.type} />
          <PropertyRow label="Node ID" value={node.id} />
        </PropertySection>

        {/* Content Section based on node type */}
        {node.content.type === 'textGeneration' && (
          <PropertySection title="Text Generation Settings">
            <PropertyRow
              label="Provider"
              value={node.content.provider}
              editable
              onChange={(v) => handleUpdateContent('provider', v)}
            />
            <PropertyRow
              label="Model"
              value={node.content.model}
              editable
              onChange={(v) => handleUpdateContent('model', v)}
            />
            <PropertyTextArea
              label="Prompt"
              value={node.content.prompt}
              placeholder="Enter your prompt..."
              onChange={(v) => handleUpdateContent('prompt', v)}
            />
          </PropertySection>
        )}

        {node.content.type === 'codeExecution' && (
          <PropertySection title="Code Settings">
            <PropertyTextArea
              label="Code"
              value={node.content.code}
              placeholder="// Enter your code..."
              onChange={(v) => handleUpdateContent('code', v)}
              rows={8}
            />
          </PropertySection>
        )}

        {node.content.type === 'apiCall' && (
          <PropertySection title="API Settings">
            <PropertyRow
              label="URL"
              value={node.content.url}
              editable
              onChange={(v) => handleUpdateContent('url', v)}
            />
            <PropertyRow
              label="Method"
              value={node.content.method}
              editable
              onChange={(v) => handleUpdateContent('method', v)}
            />
          </PropertySection>
        )}

        {node.content.type === 'conditional' && (
          <PropertySection title="Condition Settings">
            <PropertyTextArea
              label="Condition"
              value={node.content.condition}
              placeholder="Enter condition expression..."
              onChange={(v) => handleUpdateContent('condition', v)}
              rows={3}
            />
          </PropertySection>
        )}

        {node.content.type === 'text' && (
          <PropertySection title="Text Content">
            <PropertyTextArea
              label="Value"
              value={node.content.value}
              placeholder="Enter text value..."
              onChange={(v) => handleUpdateContent('value', v)}
            />
          </PropertySection>
        )}

        {node.content.type === 'prompt' && (
          <PropertySection title="Prompt">
            <PropertyTextArea
              label="Prompt Template"
              value={node.content.prompt}
              placeholder="Enter prompt template..."
              onChange={(v) => handleUpdateContent('prompt', v)}
              rows={6}
            />
          </PropertySection>
        )}

        {/* Inputs Section */}
        {node.inputs && node.inputs.length > 0 && (
          <PropertySection title="Inputs">
            {node.inputs.map((input) => (
              <div key={input.id} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-recoder-elements-textPrimary">{input.label}</span>
                {input.isRequired && (
                  <span className="text-xs text-red-400">(required)</span>
                )}
              </div>
            ))}
          </PropertySection>
        )}

        {/* Outputs Section */}
        {node.outputs && node.outputs.length > 0 && (
          <PropertySection title="Outputs">
            {node.outputs.map((output) => (
              <div key={output.id} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-recoder-elements-textPrimary">{output.label}</span>
              </div>
            ))}
          </PropertySection>
        )}
      </PropertiesPanelContent>
    </aside>
  );
}
