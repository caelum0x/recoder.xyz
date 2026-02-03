'use client';

import { useCallback, useState } from 'react';
import classNames from 'classnames';
import { useEditorStore } from './store';
import {
  SparklesIcon,
  TextIcon,
  FileIcon,
  CodeIcon,
  ApiIcon,
  ConditionalIcon,
  LoopIcon,
  TriggerIcon,
  ActionIcon,
  QueryIcon,
  ImageIcon,
  OutputIcon,
  PromptIcon,
} from './icons';
import { Tooltip } from './ui/Tooltip';
import type { NodeContentType, NodeId, InputId, OutputId, WorkflowNode } from './types';

interface NodeToolbarItem {
  type: NodeContentType;
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  nodeType: 'operation' | 'variable';
  defaultInputs?: Array<{ id: InputId; label: string; isRequired?: boolean }>;
  defaultOutputs?: Array<{ id: OutputId; label: string }>;
  category: 'inputs' | 'processing' | 'output' | 'flow';
}

const TOOLBAR_ITEMS: NodeToolbarItem[] = [
  // Input nodes
  {
    type: 'trigger',
    label: 'Trigger',
    icon: TriggerIcon,
    nodeType: 'operation',
    defaultOutputs: [{ id: 'otp_out' as OutputId, label: 'Output' }],
    category: 'inputs',
  },
  {
    type: 'text',
    label: 'Text',
    icon: TextIcon,
    nodeType: 'variable',
    defaultOutputs: [{ id: 'otp_out' as OutputId, label: 'Text' }],
    category: 'inputs',
  },
  {
    type: 'file',
    label: 'File',
    icon: FileIcon,
    nodeType: 'variable',
    defaultOutputs: [{ id: 'otp_out' as OutputId, label: 'Content' }],
    category: 'inputs',
  },
  {
    type: 'prompt',
    label: 'Prompt',
    icon: PromptIcon,
    nodeType: 'variable',
    defaultInputs: [{ id: 'inp_in' as InputId, label: 'Variables' }],
    defaultOutputs: [{ id: 'otp_out' as OutputId, label: 'Text' }],
    category: 'inputs',
  },

  // Processing nodes
  {
    type: 'textGeneration',
    label: 'AI Text',
    icon: SparklesIcon,
    nodeType: 'operation',
    defaultInputs: [{ id: 'inp_prompt' as InputId, label: 'Prompt', isRequired: true }],
    defaultOutputs: [{ id: 'otp_out' as OutputId, label: 'Response' }],
    category: 'processing',
  },
  {
    type: 'imageGeneration',
    label: 'AI Image',
    icon: ImageIcon,
    nodeType: 'operation',
    defaultInputs: [{ id: 'inp_prompt' as InputId, label: 'Prompt', isRequired: true }],
    defaultOutputs: [{ id: 'otp_out' as OutputId, label: 'Image' }],
    category: 'processing',
  },
  {
    type: 'codeExecution',
    label: 'Code',
    icon: CodeIcon,
    nodeType: 'operation',
    defaultInputs: [{ id: 'inp_in' as InputId, label: 'Input' }],
    defaultOutputs: [{ id: 'otp_out' as OutputId, label: 'Result' }],
    category: 'processing',
  },
  {
    type: 'apiCall',
    label: 'API',
    icon: ApiIcon,
    nodeType: 'operation',
    defaultInputs: [{ id: 'inp_body' as InputId, label: 'Body' }],
    defaultOutputs: [{ id: 'otp_out' as OutputId, label: 'Response' }],
    category: 'processing',
  },
  {
    type: 'query',
    label: 'Query',
    icon: QueryIcon,
    nodeType: 'operation',
    defaultInputs: [{ id: 'inp_query' as InputId, label: 'Query', isRequired: true }],
    defaultOutputs: [{ id: 'otp_out' as OutputId, label: 'Results' }],
    category: 'processing',
  },

  // Flow control
  {
    type: 'conditional',
    label: 'Condition',
    icon: ConditionalIcon,
    nodeType: 'operation',
    defaultInputs: [{ id: 'inp_value' as InputId, label: 'Value', isRequired: true }],
    defaultOutputs: [
      { id: 'otp_true' as OutputId, label: 'True' },
      { id: 'otp_false' as OutputId, label: 'False' },
    ],
    category: 'flow',
  },
  {
    type: 'loop',
    label: 'Loop',
    icon: LoopIcon,
    nodeType: 'operation',
    defaultInputs: [{ id: 'inp_items' as InputId, label: 'Items', isRequired: true }],
    defaultOutputs: [
      { id: 'otp_item' as OutputId, label: 'Item' },
      { id: 'otp_done' as OutputId, label: 'Done' },
    ],
    category: 'flow',
  },
  {
    type: 'action',
    label: 'Action',
    icon: ActionIcon,
    nodeType: 'operation',
    defaultInputs: [{ id: 'inp_in' as InputId, label: 'Trigger', isRequired: true }],
    defaultOutputs: [{ id: 'otp_out' as OutputId, label: 'Result' }],
    category: 'flow',
  },

  // Output
  {
    type: 'output',
    label: 'Output',
    icon: OutputIcon,
    nodeType: 'operation',
    defaultInputs: [{ id: 'inp_in' as InputId, label: 'Input', isRequired: true }],
    category: 'output',
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  inputs: 'Input',
  processing: 'AI & Logic',
  flow: 'Flow',
  output: 'Output',
};

let nodeCounter = 0;
function generateNodeId(): NodeId {
  return `nd_${Date.now().toString(36)}_${(++nodeCounter).toString(36)}` as NodeId;
}

export function NodeToolbar() {
  const addNode = useEditorStore((s) => s.addNode);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const handleAddNode = useCallback(
    (item: NodeToolbarItem) => {
      const nodeId = generateNodeId();
      const timestamp = Date.now().toString(36);

      const node: WorkflowNode = {
        id: nodeId,
        type: item.nodeType,
        content: {
          type: item.type,
        },
        inputs: item.defaultInputs?.map((inp) => ({
          ...inp,
          id: `${inp.id}_${timestamp}` as InputId,
        })),
        outputs: item.defaultOutputs?.map((out) => ({
          ...out,
          id: `${out.id}_${timestamp}` as OutputId,
        })),
      };

      // Add node at a random position within visible area
      const position = {
        x: 200 + Math.random() * 400,
        y: 100 + Math.random() * 300,
      };

      addNode(node, position);
    },
    [addNode]
  );

  // Group items by category
  const groupedItems = TOOLBAR_ITEMS.reduce(
    (acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, NodeToolbarItem[]>
  );

  return (
    <div className="flex flex-col h-full py-2">
      {Object.entries(groupedItems).map(([category, items]) => (
        <div key={category} className="mb-2">
          <div className="px-2 py-1">
            <span className="text-[9px] font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
              {CATEGORY_LABELS[category] || category}
            </span>
          </div>
          <div className="flex flex-col gap-1 px-1">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <Tooltip key={item.type} text={item.label} side="right">
                  <button
                    onClick={() => handleAddNode(item)}
                    className={classNames(
                      'w-full aspect-square flex items-center justify-center rounded-lg',
                      'transition-all duration-150',
                      'hover:bg-bolt-elements-background-depth-3 hover:scale-105 active:scale-95',
                      'focus:outline-none focus:ring-2 focus:ring-accent-500/50'
                    )}
                  >
                    <Icon className="w-5 h-5 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-colors" />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
