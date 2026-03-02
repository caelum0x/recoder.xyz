import { useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import {
  agentTeamAgents,
  agentTeamTasks,
  agentTeamMessages,
  dispatchQuickTask,
  approveAction,
  type AgentTeamAgent,
  type AgentTeamTask,
  type AgentTeamMessage,
} from '~/lib/stores/agent-team';
import { useAgentTeamSSE } from '~/lib/hooks/useAgentTeamSSE';

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-500',
  working: 'bg-blue-500 animate-pulse',
  idle: 'bg-yellow-500',
  error: 'bg-red-500',
  offline: 'bg-gray-400',
};

const PLATFORM_LABELS: Record<string, string> = {
  claude_code: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  replit: 'Replit',
  custom: 'Agent',
};

export function AgentTeamPanel() {
  useAgentTeamSSE();

  const agents = useStore(agentTeamAgents);
  const tasks = useStore(agentTeamTasks);
  const messages = useStore(agentTeamMessages);

  const [quickPrompt, setQuickPrompt] = useState('');

  const handleQuickDispatch = useCallback(async () => {
    const trimmed = quickPrompt.trim();
    if (!trimmed) return;
    await dispatchQuickTask(trimmed);
    setQuickPrompt('');
  }, [quickPrompt]);

  return (
    <div className="flex flex-col h-full p-4 text-recoder-elements-textPrimary">
      {/* Active Agents */}
      <section className="mb-4">
        <h3 className="text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wider mb-2">
          Agents ({agents.length})
        </h3>
        {agents.length === 0 ? (
          <p className="text-xs text-recoder-elements-textSecondary">No agents connected</p>
        ) : (
          <div className="space-y-1">
            {agents.map((agent) => (
              <AgentRow key={agent.agentId} agent={agent} />
            ))}
          </div>
        )}
      </section>

      {/* Current Tasks */}
      <section className="mb-4">
        <h3 className="text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wider mb-2">
          Tasks ({tasks.length})
        </h3>
        {tasks.length === 0 ? (
          <p className="text-xs text-recoder-elements-textSecondary">No active tasks</p>
        ) : (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {tasks.slice(0, 5).map((task) => (
              <TaskRow key={task.taskId} task={task} />
            ))}
          </div>
        )}
      </section>

      {/* Recent Messages */}
      <section className="mb-4 flex-1 min-h-0">
        <h3 className="text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wider mb-2">
          Messages
        </h3>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-xs text-recoder-elements-textSecondary">No messages yet</p>
          ) : (
            messages.slice(-5).map((msg) => (
              <MessageRow key={msg.id} message={msg} />
            ))
          )}
        </div>
      </section>

      {/* Quick Dispatch */}
      <section className="mt-auto pt-3 border-t border-recoder-elements-borderColor">
        <div className="flex gap-2">
          <input
            type="text"
            value={quickPrompt}
            onChange={(e) => setQuickPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickDispatch()}
            placeholder="Quick dispatch..."
            className="flex-1 text-xs px-2 py-1.5 rounded border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary placeholder:text-recoder-elements-textSecondary"
          />
          <button
            onClick={handleQuickDispatch}
            disabled={!quickPrompt.trim()}
            className="text-xs px-3 py-1.5 rounded bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <a
          href="/workspaces"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-[10px] text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary mt-2"
        >
          Open in Workspace →
        </a>
      </section>
    </div>
  );
}

function AgentRow({ agent }: { agent: AgentTeamAgent }) {
  const platformLabel = PLATFORM_LABELS[agent.platform] ?? 'Agent';

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-recoder-elements-background-depth-1">
      <div className={`h-2 w-2 rounded-full shrink-0 ${STATUS_COLORS[agent.status] ?? 'bg-gray-400'}`} />
      <span className="text-xs truncate">{agent.name}</span>
      <span className="text-[10px] text-recoder-elements-textSecondary ml-auto">{platformLabel}</span>
    </div>
  );
}

function TaskRow({ task }: { task: AgentTeamTask }) {
  const statusColor =
    task.status === 'completed' ? 'text-green-500' :
    task.status === 'working' ? 'text-blue-500' :
    task.status === 'failed' ? 'text-red-500' :
    'text-recoder-elements-textSecondary';

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-recoder-elements-background-depth-1">
      <span className={`text-[10px] font-medium ${statusColor}`}>{task.status}</span>
      <span className="text-xs truncate flex-1">{task.prompt.slice(0, 50)}</span>
      <span className="text-[10px] text-recoder-elements-textSecondary">{task.agentId}</span>
    </div>
  );
}

function MessageRow({ message }: { message: AgentTeamMessage }) {
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="px-2 py-1">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-medium">{message.senderName}</span>
        <span className="text-[10px] text-recoder-elements-textSecondary">{time}</span>
      </div>
      <p className="text-xs text-recoder-elements-textSecondary truncate">{message.text}</p>
    </div>
  );
}
