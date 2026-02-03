'use client';

import { useMemo, memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import classNames from 'classnames';
import { NodeIcon } from '../icons';
import { EditableText } from '../ui/EditableText';
import { Tooltip } from '../ui/Tooltip';
import { useEditorStoreWithEqualityFn, selectNodePanelDataById } from '../store';
import type { WorkflowNode as WorkflowNodeType, NodeId, NodeContentType } from '../types';
import { isNodeId, getDefaultNodeName } from '../types';

// Node color configuration based on content type
const NODE_COLORS: Record<NodeContentType, { bg: string; border: string; icon: string }> = {
  text: {
    bg: 'from-emerald-600/30 to-emerald-800/30',
    border: 'border-emerald-500/50',
    icon: 'bg-emerald-500',
  },
  file: {
    bg: 'from-blue-600/30 to-blue-800/30',
    border: 'border-blue-500/50',
    icon: 'bg-blue-500',
  },
  prompt: {
    bg: 'from-violet-600/30 to-violet-800/30',
    border: 'border-violet-500/50',
    icon: 'bg-violet-500',
  },
  textGeneration: {
    bg: 'from-purple-600/30 to-purple-800/30',
    border: 'border-purple-500/50',
    icon: 'bg-purple-500',
  },
  imageGeneration: {
    bg: 'from-pink-600/30 to-pink-800/30',
    border: 'border-pink-500/50',
    icon: 'bg-pink-500',
  },
  codeExecution: {
    bg: 'from-amber-600/30 to-amber-800/30',
    border: 'border-amber-500/50',
    icon: 'bg-amber-500',
  },
  apiCall: {
    bg: 'from-cyan-600/30 to-cyan-800/30',
    border: 'border-cyan-500/50',
    icon: 'bg-cyan-500',
  },
  conditional: {
    bg: 'from-orange-600/30 to-orange-800/30',
    border: 'border-orange-500/50',
    icon: 'bg-orange-500',
  },
  loop: {
    bg: 'from-teal-600/30 to-teal-800/30',
    border: 'border-teal-500/50',
    icon: 'bg-teal-500',
  },
  variable: {
    bg: 'from-indigo-600/30 to-indigo-800/30',
    border: 'border-indigo-500/50',
    icon: 'bg-indigo-500',
  },
  output: {
    bg: 'from-rose-600/30 to-rose-800/30',
    border: 'border-rose-500/50',
    icon: 'bg-rose-500',
  },
  trigger: {
    bg: 'from-yellow-600/30 to-yellow-800/30',
    border: 'border-yellow-500/50',
    icon: 'bg-yellow-500',
  },
  action: {
    bg: 'from-red-600/30 to-red-800/30',
    border: 'border-red-500/50',
    icon: 'bg-red-500',
  },
  query: {
    bg: 'from-sky-600/30 to-sky-800/30',
    border: 'border-sky-500/50',
    icon: 'bg-sky-500',
  },
};

// Handle colors matching node types
const HANDLE_COLORS: Record<NodeContentType, string> = {
  text: 'bg-emerald-500 border-emerald-400',
  file: 'bg-blue-500 border-blue-400',
  prompt: 'bg-violet-500 border-violet-400',
  textGeneration: 'bg-purple-500 border-purple-400',
  imageGeneration: 'bg-pink-500 border-pink-400',
  codeExecution: 'bg-amber-500 border-amber-400',
  apiCall: 'bg-cyan-500 border-cyan-400',
  conditional: 'bg-orange-500 border-orange-400',
  loop: 'bg-teal-500 border-teal-400',
  variable: 'bg-indigo-500 border-indigo-400',
  output: 'bg-rose-500 border-rose-400',
  trigger: 'bg-yellow-500 border-yellow-400',
  action: 'bg-red-500 border-red-400',
  query: 'bg-sky-500 border-sky-400',
};

interface WorkflowNodeComponentProps extends NodeProps {
  data: Record<string, unknown>;
}

export const WorkflowNodeComponent = memo(function WorkflowNodeComponent({
  id,
  selected,
}: WorkflowNodeComponentProps) {
  const nodeId = id as NodeId;

  const {
    node,
    connectedInputIds,
    connectedOutputIds,
    highlighted,
    updateNode,
  } = useEditorStoreWithEqualityFn(
    selectNodePanelDataById(nodeId),
    (a, b) =>
      a.node === b.node &&
      JSON.stringify(a.connectedInputIds) === JSON.stringify(b.connectedInputIds) &&
      JSON.stringify(a.connectedOutputIds) === JSON.stringify(b.connectedOutputIds) &&
      a.highlighted === b.highlighted
  );

  const colors = useMemo(() => {
    if (!node) return NODE_COLORS.textGeneration;
    return NODE_COLORS[node.content.type] ?? NODE_COLORS.textGeneration;
  }, [node]);

  const handleColors = useMemo(() => {
    if (!node) return HANDLE_COLORS.textGeneration;
    return HANDLE_COLORS[node.content.type] ?? HANDLE_COLORS.textGeneration;
  }, [node]);

  const metadataTexts = useMemo(() => {
    if (!node) return [];
    const items: { label: string; tooltip: string }[] = [];

    if (node.content.provider) {
      items.push({ label: node.content.provider, tooltip: 'Provider' });
    }
    if (node.content.model) {
      items.push({ label: node.content.model, tooltip: 'Model' });
    }
    items.push({ label: node.id.substring(3, 11), tooltip: 'Node ID' });

    return items;
  }, [node]);

  if (!node) {
    return null;
  }

  const handleNameChange = (value: string) => {
    const defaultName = getDefaultNodeName(node);
    if (value === defaultName || value.trim().length === 0) {
      updateNode(node.id, { name: undefined });
      return;
    }
    updateNode(node.id, { name: value });
  };

  return (
    <div
      className={classNames(
        'group relative flex flex-col rounded-2xl py-4 gap-4 min-w-[200px]',
        'bg-gradient-to-br backdrop-blur-sm transition-all duration-200',
        colors.bg,
        'border-[1.5px]',
        colors.border,
        selected && 'ring-2 ring-accent-500/50 shadow-lg shadow-accent-500/20',
        highlighted && 'ring-2 ring-white/30',
        !selected && !highlighted && 'shadow-lg shadow-black/30'
      )}
    >
      {/* Node Header */}
      <div className="px-4 relative">
        <div className="flex items-center gap-3">
          {/* Icon Container */}
          <div
            className={classNames(
              'w-8 h-8 flex items-center justify-center rounded-lg',
              colors.icon
            )}
          >
            <NodeIcon node={node} className="w-4 h-4 text-white" />
          </div>

          {/* Title and Metadata */}
          <div className="flex-1 min-w-0">
            {/* Metadata Labels */}
            <div className="flex items-center gap-1 text-[10px] font-mono text-bolt-elements-textTertiary">
              {metadataTexts.map((item, index) => (
                <span key={item.label} className="flex items-center">
                  {selected ? (
                    <Tooltip text={item.tooltip} variant="dark">
                      <button type="button" className="hover:text-bolt-elements-textPrimary transition-colors">
                        {item.label}
                      </button>
                    </Tooltip>
                  ) : (
                    <span>{item.label}</span>
                  )}
                  {index < metadataTexts.length - 1 && (
                    <span className="mx-1 text-bolt-elements-textTertiary">/</span>
                  )}
                </span>
              ))}
            </div>

            {/* Node Name */}
            <EditableText
              className={classNames(
                'text-sm font-medium text-bolt-elements-textPrimary',
                !selected && 'pointer-events-none'
              )}
              text={getDefaultNodeName(node)}
              onValueChange={handleNameChange}
              onClickToEditMode={(e) => {
                if (!selected) {
                  e.preventDefault();
                }
                e.stopPropagation();
              }}
              readonly={!selected}
            />
          </div>
        </div>
      </div>

      {/* Inputs and Outputs */}
      <div className="flex justify-between min-h-[28px]">
        {/* Inputs */}
        <div className="flex flex-col">
          {node.inputs?.map((input) => {
            const isConnected = connectedInputIds?.includes(input.id);
            return (
              <div
                key={input.id}
                className="relative flex items-center h-7"
                data-connected={isConnected}
              >
                {/* @ts-expect-error reactflow Handle JSX compatibility */}
                <Handle
                  type="target"
                  position={Position.Left}
                  id={input.id}
                  className={classNames(
                    '!absolute !w-3 !h-3 !rounded-full !border-[1.5px] !-left-[6px]',
                    '!transition-all !duration-200',
                    isConnected
                      ? handleColors
                      : 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor hover:border-bolt-elements-borderColor'
                  )}
                />
                <span
                  className={classNames(
                    'text-xs pl-4',
                    isConnected ? 'text-bolt-elements-textPrimary' : 'text-bolt-elements-textTertiary'
                  )}
                >
                  {input.label}
                  {input.isRequired && <span className="text-red-400 ml-0.5">*</span>}
                </span>
              </div>
            );
          })}
        </div>

        {/* Outputs */}
        <div className="flex flex-col items-end">
          {node.outputs?.map((output) => {
            const isConnected = connectedOutputIds?.includes(output.id);
            return (
              <div
                key={output.id}
                className="relative flex items-center h-7"
                data-connected={isConnected}
              >
                <span
                  className={classNames(
                    'text-xs pr-4',
                    isConnected ? 'text-bolt-elements-textPrimary' : 'text-bolt-elements-textTertiary'
                  )}
                >
                  {output.label}
                </span>
                {/* @ts-expect-error reactflow Handle JSX compatibility */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  className={classNames(
                    '!absolute !w-3 !h-3 !rounded-full !border-[1.5px] !-right-[6px]',
                    '!transition-all !duration-200',
                    isConnected
                      ? handleColors
                      : 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor hover:border-bolt-elements-borderColor'
                  )}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default WorkflowNodeComponent;
