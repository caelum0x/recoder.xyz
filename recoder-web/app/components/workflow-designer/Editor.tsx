'use client';

import { useState, useCallback } from 'react';
import classNames from 'classnames';
import { EditorStoreProvider, createSampleWorkflow, createEmptyWorkflow } from './EditorProvider';
import { NodeCanvas } from './NodeCanvas';
import { PropertiesPanel } from './PropertiesPanel';
import { DebuggerPanel } from './Debugger';
import { NodeToolbar } from './NodeToolbar';
import type { Workflow } from './types';

export interface EditorProps {
  workflow?: Workflow;
  isReadOnly?: boolean;
  showDebugger?: boolean;
  showToolbar?: boolean;
  onWorkflowChange?: (workflow: Workflow) => void;
  className?: string;
}

export function Editor({
  workflow,
  isReadOnly = false,
  showDebugger = false,
  showToolbar = true,
  onWorkflowChange,
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
          'flex flex-col h-full w-full overflow-hidden bg-bolt-elements-background-depth-1',
          className
        )}
      >
        {/* Main Editor Area */}
        <div className="flex-1 flex min-h-0">
          {/* Toolbar (Left sidebar) */}
          {showToolbar && !isReadOnly && (
            <div className="w-16 shrink-0 border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
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
                  : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3'
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
          <div className="h-64 shrink-0 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 overflow-hidden">
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

  return (
    <Editor
      {...props}
      workflow={workflow}
      onWorkflowChange={setWorkflow}
    />
  );
}
