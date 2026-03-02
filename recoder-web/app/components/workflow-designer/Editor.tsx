'use client';

import { useState } from 'react';
import classNames from 'classnames';
import { EditorStoreProvider, createSampleWorkflow, createEmptyWorkflow } from './EditorProvider';
import { useEditorStore } from './store';
import { NodeCanvas } from './NodeCanvas';
import { PropertiesPanel } from './PropertiesPanel';
import { DebuggerPanel } from './Debugger';
import { NodeToolbar } from './NodeToolbar';
import type { Workflow } from './types';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('WorkflowEditor');

export interface EditorProps {
  workflow?: Workflow;
  isReadOnly?: boolean;
  showDebugger?: boolean;
  showToolbar?: boolean;
  onWorkflowChange?: (workflow: Workflow) => void;
  onDuplicateWorkflow?: (
    workflow: Workflow,
    options: { includeTriggers: boolean; includeSecrets: boolean }
  ) => Promise<void> | void;
  className?: string;
}

function buildWorkflowSnapshot(state: {
  workflowId: string;
  name: string;
  nodes: Workflow['nodes'];
  connections: Workflow['connections'];
  ui: Workflow['ui'];
}): Workflow {
  return {
    id: state.workflowId as Workflow['id'],
    name: state.name,
    nodes: state.nodes,
    connections: state.connections,
    ui: state.ui,
  };
}

function HeaderActions({
  onDuplicateWorkflow,
}: {
  onDuplicateWorkflow?: (
    workflow: Workflow,
    options: { includeTriggers: boolean; includeSecrets: boolean }
  ) => Promise<void> | void;
}) {
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [includeTriggers, setIncludeTriggers] = useState(false);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const workflowState = useEditorStore((s) => ({
    workflowId: s.workflowId,
    name: s.name,
    nodes: s.nodes,
    connections: s.connections,
    ui: s.ui,
  }));

  const handleDuplicate = async () => {
    if (!onDuplicateWorkflow || isDuplicating) return;
    setIsDuplicating(true);
    try {
      await onDuplicateWorkflow(buildWorkflowSnapshot(workflowState), {
        includeTriggers,
        includeSecrets,
      });
    } catch (error) {
      logger.error('[workflow-designer] duplicate failed:', error);
    } finally {
      setIsDuplicating(false);
      setShowOptions(false);
    }
  };

  return (
    <div className="h-12 shrink-0 border-b border-recoder-elements-borderColor bg-recoder-elements-background-depth-2 flex items-center justify-end px-3 relative">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowOptions((v) => !v)}
          disabled={!onDuplicateWorkflow || isDuplicating}
          className={classNames(
            'px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
            'border border-recoder-elements-borderColor',
            (!onDuplicateWorkflow || isDuplicating)
              ? 'opacity-60 cursor-not-allowed bg-recoder-elements-background-depth-1 text-recoder-elements-textTertiary'
              : 'bg-recoder-elements-background-depth-1 text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-3',
          )}
          title="Duplicate options"
        >
          Options
        </button>
        <button
          onClick={handleDuplicate}
          disabled={!onDuplicateWorkflow || isDuplicating}
          className={classNames(
            'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            'border border-recoder-elements-borderColor',
            (!onDuplicateWorkflow || isDuplicating)
              ? 'opacity-60 cursor-not-allowed bg-recoder-elements-background-depth-1 text-recoder-elements-textTertiary'
              : 'bg-recoder-elements-background-depth-1 text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-3',
          )}
        >
          {isDuplicating ? 'Duplicating...' : 'Duplicate Workflow'}
        </button>
      </div>
      {showOptions && (
        <div className="absolute right-3 top-11 z-10 min-w-56 rounded-md border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 p-3 shadow-xl">
          <div className="text-xs font-medium text-recoder-elements-textSecondary mb-2">Copy options</div>
          <label className="flex items-center gap-2 text-xs text-recoder-elements-textSecondary mb-2">
            <input
              type="checkbox"
              checked={includeTriggers}
              onChange={(e) => setIncludeTriggers(e.target.checked)}
            />
            Include triggers
          </label>
          <label className="flex items-center gap-2 text-xs text-recoder-elements-textSecondary">
            <input
              type="checkbox"
              checked={includeSecrets}
              onChange={(e) => setIncludeSecrets(e.target.checked)}
            />
            Include secrets
          </label>
        </div>
      )}
    </div>
  );
}

export function Editor({
  workflow,
  isReadOnly = false,
  showDebugger = false,
  showToolbar = true,
  onWorkflowChange,
  onDuplicateWorkflow,
  className,
}: EditorProps) {
  // Use provided workflow or create a sample one
  const [currentWorkflow] = useState<Workflow>(
    () => workflow || createSampleWorkflow()
  );

  const [isDebuggerOpen, setIsDebuggerOpen] = useState(showDebugger);

  return (
    <EditorStoreProvider workflow={currentWorkflow}>
      <div
        className={classNames(
          'flex flex-col h-full w-full overflow-hidden bg-recoder-elements-background-depth-1',
          className
        )}
      >
        {!isReadOnly && (
          <HeaderActions onDuplicateWorkflow={onDuplicateWorkflow} />
        )}
        {/* Main Editor Area */}
        <div className="flex-1 flex min-h-0">
          {/* Toolbar (Left sidebar) */}
          {showToolbar && !isReadOnly && (
            <div className="w-16 shrink-0 border-r border-recoder-elements-borderColor bg-recoder-elements-background-depth-1">
              <NodeToolbar />
            </div>
          )}

          {/* Canvas Area */}
          <div className="flex-1 relative min-w-0">
            <NodeCanvas />

            {/* Floating Debug Toggle */}
            <button
              onClick={() => setIsDebuggerOpen(!isDebuggerOpen)}
              className={classNames(
                'absolute bottom-4 left-4 px-3 py-2 rounded-lg text-sm font-medium',
                'transition-all duration-200 shadow-lg',
                isDebuggerOpen
                  ? 'bg-accent-500 text-white'
                  : 'bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-3'
              )}
            >
              {isDebuggerOpen ? 'Hide Debug' : 'Debug'}
            </button>
          </div>

          {/* Properties Panel (Right sidebar) */}
          <PropertiesPanel />
        </div>

        {/* Debug Panel (Bottom) */}
        {isDebuggerOpen && (
          <div className="h-64 shrink-0 border-t border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 overflow-hidden">
            <DebuggerPanel />
          </div>
        )}
      </div>
    </EditorStoreProvider>
  );
}

// Standalone Editor with its own state management
export function StandaloneEditor(props: Omit<EditorProps, 'workflow'>) {
  const [workflow, setWorkflow] = useState<Workflow>(() => createSampleWorkflow());

  const handleDuplicateWorkflow = async (
    current: Workflow,
    options: { includeTriggers: boolean; includeSecrets: boolean },
  ) => {
    const sourceCreateResponse = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: current.name || 'Workflow Workspace',
        nodes: current.nodes.map((node) => ({
          id: node.id,
          type: node.type,
          position: current.ui.nodeState[node.id]?.position || { x: 0, y: 0 },
          data: { node },
        })),
        connections: current.connections.map((connection) => ({
          id: connection.id,
          source: connection.outputNode.id,
          target: connection.inputNode.id,
          sourceHandle: connection.outputId,
          targetHandle: connection.inputId,
        })),
        metadata: { editorWorkflowId: current.id },
      }),
    });

    if (!sourceCreateResponse.ok) {
      throw new Error(`Failed to stage workflow: ${sourceCreateResponse.status}`);
    }

    const sourcePayload = await sourceCreateResponse.json() as {
      success?: boolean;
      workspace?: { id?: string };
      error?: string;
    };
    const sourceWorkspaceId = sourcePayload.workspace?.id;
    if (!sourcePayload.success || !sourceWorkspaceId) {
      throw new Error(sourcePayload.error || 'Failed to stage workflow');
    }

    const duplicateResponse = await fetch('/api/workspaces?action=duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceWorkspaceId,
        newWorkspaceName: `${current.name || 'Workflow'} (copy)`,
        includeTriggers: options.includeTriggers,
        includeSecrets: options.includeSecrets,
      }),
    });

    if (!duplicateResponse.ok) {
      throw new Error(`Failed to duplicate workflow workspace: ${duplicateResponse.status}`);
    }

    const duplicatePayload = await duplicateResponse.json() as {
      success?: boolean;
      workspace?: {
        id: string;
        name?: string;
        nodes?: Array<{
          id: string;
          type: 'operation' | 'variable';
          data?: { node?: Workflow['nodes'][number] };
          position?: { x: number; y: number };
        }>;
        connections?: Array<{
          id: string;
          source: string;
          target: string;
          sourceHandle?: string;
          targetHandle?: string;
        }>;
      };
      error?: string;
    };

    if (!duplicatePayload.success || !duplicatePayload.workspace) {
      throw new Error(duplicatePayload.error || 'Failed to duplicate workflow workspace');
    }

    const duplicatedWorkspace = duplicatePayload.workspace;
    const duplicatedNodes = (duplicatedWorkspace.nodes || []).map((node) => {
      const embedded = node.data?.node;
      if (embedded && typeof embedded === 'object') {
        return {
          ...embedded,
          id: node.id as Workflow['nodes'][number]['id'],
          type: node.type,
        };
      }
      return {
        id: node.id as Workflow['nodes'][number]['id'],
        type: node.type,
        name: node.type === 'operation' ? 'Operation' : 'Variable',
        content: { type: 'text' as const },
        inputs: [],
        outputs: [],
      };
    });

    const duplicatedUiState = Object.fromEntries(
      duplicatedNodes.map((node) => [
        node.id,
        {
          position: (duplicatedWorkspace.nodes || []).find((n) => n.id === node.id)?.position || { x: 0, y: 0 },
          selected: false,
          highlighted: false,
        },
      ]),
    ) as Workflow['ui']['nodeState'];

    const duplicatedWorkflow: Workflow = {
      id: duplicatedWorkspace.id as Workflow['id'],
      name: duplicatedWorkspace.name || `${current.name || 'Workflow'} (copy)`,
      nodes: duplicatedNodes,
      connections: (duplicatedWorkspace.connections || []).map((connection) => ({
        id: connection.id as Workflow['connections'][number]['id'],
        outputNode: { id: connection.source as Workflow['connections'][number]['outputNode']['id'] },
        outputId: (connection.sourceHandle || 'out') as Workflow['connections'][number]['outputId'],
        inputNode: { id: connection.target as Workflow['connections'][number]['inputNode']['id'] },
        inputId: (connection.targetHandle || 'in') as Workflow['connections'][number]['inputId'],
      })),
      ui: {
        nodeState: duplicatedUiState,
        inspectedNodeId: undefined,
      },
    };

    setWorkflow(duplicatedWorkflow);
  };

  return (
    <Editor
      {...props}
      workflow={workflow}
      onWorkflowChange={setWorkflow}
      onDuplicateWorkflow={handleDuplicateWorkflow}
    />
  );
}
