'use client';

import { memo, useCallback } from 'react';
import classNames from 'classnames';
import { useEditorStore, useEditorStoreWithEqualityFn, selectNodeIds, selectNode } from './store';
import { NodeIcon, ChevronRightIcon, ChevronDownIcon } from './icons';
import type { NodeId, WorkflowNode } from './types';
import { getDefaultNodeName } from './types';
import { useState } from 'react';

// Debug Viewer - Shows read-only view of all nodes
export function DebugViewer() {
  const nodeIds = useEditorStoreWithEqualityFn(
    selectNodeIds,
    (a, b) => JSON.stringify(a) === JSON.stringify(b)
  );

  return (
    <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
        <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Node Debug Viewer</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor">
              <th className="px-4 py-2 text-left text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
                Content
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bolt-elements-borderColor">
            {nodeIds.map((id) => (
              <ViewerRow key={id} id={id} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ViewerRow = memo(function ViewerRow({ id }: { id: NodeId }) {
  const node = useEditorStoreWithEqualityFn(
    selectNode(id),
    (a, b) => a === b
  );
  const [isExpanded, setIsExpanded] = useState(false);

  if (!node) return null;

  const contentPreview = getContentPreview(node);

  return (
    <>
      <tr className="hover:bg-bolt-elements-background-depth-3 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <td className="px-4 py-2 whitespace-nowrap">
          <div className="flex items-center gap-2">
            {contentPreview.length > 50 ? (
              isExpanded ? (
                <ChevronDownIcon className="w-4 h-4 text-bolt-elements-textTertiary" />
              ) : (
                <ChevronRightIcon className="w-4 h-4 text-bolt-elements-textTertiary" />
              )
            ) : (
              <span className="w-4" />
            )}
            <NodeIcon node={node} className="w-4 h-4 text-bolt-elements-textTertiary" />
            <span className="text-bolt-elements-textPrimary">{getDefaultNodeName(node)}</span>
          </div>
        </td>
        <td className="px-4 py-2 whitespace-nowrap text-bolt-elements-textTertiary">
          {node.content.type}
        </td>
        <td className="px-4 py-2 text-bolt-elements-textTertiary max-w-xs truncate">
          {isExpanded ? '' : contentPreview.substring(0, 50)}
          {!isExpanded && contentPreview.length > 50 && '...'}
        </td>
      </tr>
      {isExpanded && contentPreview.length > 50 && (
        <tr className="bg-bolt-elements-background-depth-2/30">
          <td colSpan={3} className="px-4 py-3">
            <pre className="text-xs text-bolt-elements-textSecondary whitespace-pre-wrap font-mono">
              {contentPreview}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
});

function getContentPreview(node: WorkflowNode): string {
  const content = node.content;
  if (content.prompt) return content.prompt;
  if (content.code) return content.code;
  if (content.url) return `${content.method || 'GET'} ${content.url}`;
  if (content.condition) return content.condition;
  if (content.value) return content.value;
  return '-';
}

// Debug Form - Allows editing nodes
export function DebugForm() {
  const nodeIds = useEditorStoreWithEqualityFn(
    selectNodeIds,
    (a, b) => JSON.stringify(a) === JSON.stringify(b)
  );

  return (
    <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
        <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Node Editor</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor">
              <th className="px-4 py-2 text-left text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bolt-elements-borderColor">
            {nodeIds.map((id) => (
              <FormRow key={id} id={id} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FormRow = memo(function FormRow({ id }: { id: NodeId }) {
  const node = useEditorStoreWithEqualityFn(
    selectNode(id),
    (a, b) => a === b
  );
  const updateNode = useEditorStore((s) => s.updateNode);
  const removeNode = useEditorStore((s) => s.removeNode);
  const setInspectedNodeId = useEditorStore((s) => s.setInspectedNodeId);

  const handleChangeName = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNode(id, { name: e.target.value || undefined });
    },
    [updateNode, id]
  );

  const handleDelete = useCallback(() => {
    if (confirm('Are you sure you want to delete this node?')) {
      removeNode(id);
    }
  }, [removeNode, id]);

  const handleEdit = useCallback(() => {
    setInspectedNodeId(id);
  }, [setInspectedNodeId, id]);

  if (!node) return null;

  return (
    <tr className="hover:bg-bolt-elements-background-depth-3">
      <td className="px-4 py-2">
        <input
          type="text"
          value={node.name || ''}
          onChange={handleChangeName}
          placeholder={getDefaultNodeName(node)}
          className="w-full px-2 py-1 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-sm text-bolt-elements-textPrimary
                     placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-accent-500"
        />
      </td>
      <td className="px-4 py-2 whitespace-nowrap text-bolt-elements-textTertiary">
        {node.content.type}
      </td>
      <td className="px-4 py-2 whitespace-nowrap">
        <div className="flex gap-2">
          <button
            onClick={handleEdit}
            className="px-2 py-1 text-xs bg-accent-500/20 text-accent-400 rounded hover:bg-accent-500/30 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
});

// Combined Debugger Panel
export function DebuggerPanel() {
  const [activeTab, setActiveTab] = useState<'viewer' | 'editor'>('viewer');

  return (
    <div className="flex flex-col h-full">
      {/* Tab Navigation */}
      <div className="flex border-b border-bolt-elements-borderColor">
        <button
          onClick={() => setActiveTab('viewer')}
          className={classNames(
            'px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'viewer'
              ? 'text-bolt-elements-textPrimary border-b-2 border-accent-500'
              : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
          )}
        >
          Viewer
        </button>
        <button
          onClick={() => setActiveTab('editor')}
          className={classNames(
            'px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'editor'
              ? 'text-bolt-elements-textPrimary border-b-2 border-accent-500'
              : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary'
          )}
        >
          Editor
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'viewer' ? <DebugViewer /> : <DebugForm />}
      </div>
    </div>
  );
}
