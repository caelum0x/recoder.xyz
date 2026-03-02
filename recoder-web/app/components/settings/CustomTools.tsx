import { useState } from 'react';
import { useCustomTools } from '~/lib/hooks/useCustomTools';
import type { CustomTool } from '~/lib/stores/custom-tools';

export function CustomTools() {
  const { tools, executions, addTool, updateTool, deleteTool, toggleTool, runTool } = useCustomTools();
  const [editing, setEditing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTool, setNewTool] = useState({ name: '', description: '', command: '', workingDir: '' });

  const handleAdd = () => {
    if (!newTool.name || !newTool.command) return;
    addTool({ ...newTool, enabled: true });
    setNewTool({ name: '', description: '', command: '', workingDir: '' });
    setShowAdd(false);
  };

  const handleRun = async (toolId: string) => {
    await runTool(toolId);
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-recoder-elements-textPrimary">Custom Tools</h3>
          <p className="text-sm text-recoder-elements-textSecondary">
            Create commands that AI can use during code generation
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-1.5 text-sm bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text rounded-md hover:opacity-90"
        >
          {showAdd ? 'Cancel' : '+ Add Tool'}
        </button>
      </div>

      {/* Add New Tool Form */}
      {showAdd && (
        <div className="p-4 bg-recoder-elements-background-depth-2 rounded-lg border border-recoder-elements-borderColor space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-recoder-elements-textSecondary mb-1">Name *</label>
              <input
                value={newTool.name}
                onChange={e => setNewTool(p => ({ ...p, name: e.target.value.toLowerCase().replace(/\s/g, '-') }))}
                placeholder="e.g., deploy"
                className="w-full px-3 py-2 text-sm bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs text-recoder-elements-textSecondary mb-1">Description</label>
              <input
                value={newTool.description}
                onChange={e => setNewTool(p => ({ ...p, description: e.target.value }))}
                placeholder="What does this tool do?"
                className="w-full px-3 py-2 text-sm bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-recoder-elements-textSecondary mb-1">Command *</label>
            <input
              value={newTool.command}
              onChange={e => setNewTool(p => ({ ...p, command: e.target.value }))}
              placeholder="e.g., npm run deploy"
              className="w-full px-3 py-2 text-sm font-mono bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs text-recoder-elements-textSecondary mb-1">Working Directory (optional)</label>
            <input
              value={newTool.workingDir}
              onChange={e => setNewTool(p => ({ ...p, workingDir: e.target.value }))}
              placeholder="e.g., ./packages/app"
              className="w-full px-3 py-2 text-sm font-mono bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor rounded-md"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!newTool.name || !newTool.command}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Tool
          </button>
        </div>
      )}

      {/* Tools List */}
      <div className="space-y-2">
        {tools.length === 0 ? (
          <div className="text-center py-8 text-recoder-elements-textSecondary">
            No custom tools yet. Click "Add Tool" to create one.
          </div>
        ) : (
          tools.map(tool => (
            <ToolItem
              key={tool.id}
              tool={tool}
              execution={executions[tool.id]}
              isEditing={editing === tool.id}
              onEdit={() => setEditing(editing === tool.id ? null : tool.id)}
              onUpdate={(updates) => updateTool(tool.id, updates)}
              onDelete={() => deleteTool(tool.id)}
              onToggle={() => toggleTool(tool.id)}
              onRun={() => handleRun(tool.id)}
            />
          ))
        )}
      </div>

      {/* AI Integration Info */}
      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <div className="text-sm text-blue-400 font-medium">AI Integration</div>
        <p className="text-xs text-recoder-elements-textSecondary mt-1">
          Enabled tools are automatically available to AI. Ask it to "run format" or "execute the lint tool" and it will use your custom commands.
        </p>
      </div>
    </div>
  );
}

interface ToolItemProps {
  tool: CustomTool;
  execution?: { status: string; output: string };
  isEditing: boolean;
  onEdit: () => void;
  onUpdate: (updates: Partial<CustomTool>) => void;
  onDelete: () => void;
  onToggle: () => void;
  onRun: () => void;
}

function ToolItem({ tool, execution, isEditing, onEdit, onUpdate, onDelete, onToggle, onRun }: ToolItemProps) {
  const [editValues, setEditValues] = useState(tool);

  const handleSave = () => {
    onUpdate(editValues);
    onEdit();
  };

  return (
    <div className={`p-3 rounded-lg border ${tool.enabled ? 'bg-recoder-elements-background-depth-2 border-recoder-elements-borderColor' : 'bg-recoder-elements-background-depth-1 border-transparent opacity-60'}`}>
      {isEditing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={editValues.name}
              onChange={e => setEditValues(p => ({ ...p, name: e.target.value }))}
              className="px-2 py-1 text-sm bg-recoder-elements-background-depth-3 rounded"
              placeholder="Name"
            />
            <input
              value={editValues.description}
              onChange={e => setEditValues(p => ({ ...p, description: e.target.value }))}
              className="px-2 py-1 text-sm bg-recoder-elements-background-depth-3 rounded"
              placeholder="Description"
            />
          </div>
          <input
            value={editValues.command}
            onChange={e => setEditValues(p => ({ ...p, command: e.target.value }))}
            className="w-full px-2 py-1 text-sm font-mono bg-recoder-elements-background-depth-3 rounded"
            placeholder="Command"
          />
          <div className="flex gap-2">
            <button onClick={handleSave} className="px-3 py-1 text-xs bg-green-600 text-white rounded">Save</button>
            <button onClick={onEdit} className="px-3 py-1 text-xs bg-recoder-elements-background-depth-3 rounded">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={tool.enabled}
            onChange={onToggle}
            className="w-4 h-4 accent-recoder-elements-button-primary-background"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-recoder-elements-textPrimary">{tool.name}</span>
              {execution?.status === 'running' && (
                <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">Running...</span>
              )}
              {execution?.status === 'success' && (
                <span className="px-1.5 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">✓</span>
              )}
              {execution?.status === 'error' && (
                <span className="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">Error</span>
              )}
            </div>
            <div className="text-xs text-recoder-elements-textSecondary truncate">{tool.description}</div>
            <code className="text-xs text-recoder-elements-textTertiary">{tool.command}</code>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onRun}
              disabled={!tool.enabled}
              className="p-1.5 text-xs hover:bg-recoder-elements-background-depth-3 rounded disabled:opacity-50"
              title="Run tool"
            >
              ▶
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 text-xs hover:bg-recoder-elements-background-depth-3 rounded"
              title="Edit"
            >
              ✎
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded"
              title="Delete"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
