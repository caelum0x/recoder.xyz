'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Check,
  ChevronRight,
  FlaskConical,
  Loader2,
  MessageCircle,
  Play,
  PlayCircle,
  Plus,
  Send,
  Square,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCreateSandbox,
  useSendSandboxMessage,
  useSandboxSession,
  useEndSandbox,
  useTestCases,
  useCreateTestCase,
  useRunTestCase,
  useDeleteTestCase,
} from '@/hooks/agents/use-agent-sandbox';
import type { SandboxMessage, SandboxTestCase } from '@/lib/api/agent-sandbox';

// ============================================================================
// Sandbox Chat Interface
// ============================================================================

function SandboxChat({ agentId }: { agentId: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [localMessages, setLocalMessages] = useState<SandboxMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const createSandbox = useCreateSandbox();
  const sendMessage = useSendSandboxMessage();
  const endSandbox = useEndSandbox();
  const { data: session } = useSandboxSession(agentId, sessionId);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  // Sync messages from session data
  useEffect(() => {
    if (session?.messages) {
      setLocalMessages(session.messages);
    }
  }, [session?.messages]);

  const handleStartSession = async () => {
    try {
      const result = await createSandbox.mutateAsync({
        agentId,
        data: { expires_minutes: 60 },
      });
      setSessionId(result.id);
      setLocalMessages([]);
    } catch {
      // Error handled by mutation
    }
  };

  const handleEndSession = async () => {
    if (!sessionId) return;
    try {
      await endSandbox.mutateAsync({ agentId, sessionId });
      setSessionId(null);
      setLocalMessages([]);
    } catch {
      // Error handled by mutation
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !inputValue.trim() || sendMessage.isPending) return;

    const content = inputValue.trim();
    setInputValue('');

    // Optimistic add
    const optimisticMsg: SandboxMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, optimisticMsg]);

    try {
      const result = await sendMessage.mutateAsync({
        agentId,
        sessionId,
        data: { content },
      });
      // Replace with real messages
      setLocalMessages(result.session.messages);
    } catch {
      // Revert optimistic
      setLocalMessages((prev) => prev.slice(0, -1));
    }
  };

  // No active session
  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <FlaskConical className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-1">Agent Sandbox</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          Start a sandbox session to test your agent in an isolated environment. Messages are simulated -- connect to the agent runtime for real responses.
        </p>
        <button
          onClick={handleStartSession}
          disabled={createSandbox.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 h-10 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {createSandbox.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Start Sandbox Session
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Session header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm font-medium">Sandbox Session Active</span>
        <span className="text-xs text-muted-foreground font-mono truncate">
          {sessionId.slice(0, 8)}
        </span>
        <div className="flex-1" />
        <button
          onClick={handleEndSession}
          disabled={endSandbox.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 h-7 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          {endSandbox.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Square className="h-3 w-3" />
          )}
          End Session
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {localMessages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Send a message to start testing
          </div>
        )}
        {localMessages.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              'flex',
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-xl px-4 py-2.5 text-sm',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              )}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className="text-[10px] opacity-60 mt-1">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        {sendMessage.isPending && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-4 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="border-t border-border p-3 flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type a message to test..."
          className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || sendMessage.isPending}
          className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// Test Case Manager
// ============================================================================

function TestCaseManager({ agentId }: { agentId: string }) {
  const { data, isLoading } = useTestCases(agentId);
  const createTestCase = useCreateTestCase();
  const runTestCase = useRunTestCase();
  const deleteTestCase = useDeleteTestCase();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newInput, setNewInput] = useState('');
  const [newExpected, setNewExpected] = useState('');
  const [runningAll, setRunningAll] = useState(false);

  const testCases = data?.test_cases ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newInput.trim()) return;

    try {
      await createTestCase.mutateAsync({
        agentId,
        data: {
          name: newName.trim(),
          input_message: newInput.trim(),
          expected_behavior: newExpected.trim() || undefined,
        },
      });
      setNewName('');
      setNewInput('');
      setNewExpected('');
      setShowCreate(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleRunAll = async () => {
    if (runningAll || testCases.length === 0) return;
    setRunningAll(true);
    try {
      for (const tc of testCases) {
        await runTestCase.mutateAsync({ agentId, caseId: tc.id });
      }
    } catch {
      // Error handled by mutation
    } finally {
      setRunningAll(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <span className="text-sm font-medium">Test Cases</span>
        <span className="text-xs text-muted-foreground">({testCases.length})</span>
        <div className="flex-1" />
        {testCases.length > 0 && (
          <button
            onClick={handleRunAll}
            disabled={runningAll}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 h-7 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {runningAll ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <PlayCircle className="h-3 w-3" />
            )}
            Run All
          </button>
        )}
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 h-7 text-xs font-medium hover:bg-muted transition-colors"
        >
          {showCreate ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {showCreate ? 'Cancel' : 'Add'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="p-4 border-b border-border space-y-3 bg-muted/20">
          <div>
            <label className="block text-xs font-medium mb-1">Test Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              placeholder="e.g. Greeting test"
              className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Input Message</label>
            <textarea
              value={newInput}
              onChange={(e) => setNewInput(e.target.value)}
              required
              rows={2}
              placeholder="The message to send to the agent..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Expected Behavior (optional)</label>
            <textarea
              value={newExpected}
              onChange={(e) => setNewExpected(e.target.value)}
              rows={2}
              placeholder="What you expect the agent to do..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createTestCase.isPending || !newName.trim() || !newInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 h-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {createTestCase.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Test Case
            </button>
          </div>
        </form>
      )}

      {/* Test case list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : testCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <FlaskConical className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No test cases yet. Add one to start testing.
            </p>
          </div>
        ) : (
          testCases.map((tc) => (
            <TestCaseRow
              key={tc.id}
              testCase={tc}
              agentId={agentId}
              onRun={() => runTestCase.mutateAsync({ agentId, caseId: tc.id })}
              onDelete={() => deleteTestCase.mutateAsync({ agentId, caseId: tc.id })}
              isRunning={runTestCase.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Test Case Row
// ============================================================================

function TestCaseRow({
  testCase,
  agentId,
  onRun,
  onDelete,
  isRunning,
}: {
  testCase: SandboxTestCase;
  agentId: string;
  onRun: () => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  isRunning: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [running, setRunning] = useState(false);

  const totalRuns = testCase.pass_count + testCase.fail_count;
  const passRate = totalRuns > 0 ? Math.round((testCase.pass_count / totalRuns) * 100) : null;
  const lastPassed = testCase.last_result?.passed;

  const handleRun = async () => {
    setRunning(true);
    try {
      await onRun();
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {expanded ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 rotate-90 transition-transform" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform" />
        )}

        {/* Pass/fail indicator */}
        <div className="shrink-0">
          {lastPassed === true && (
            <Check className="h-4 w-4 text-green-500" />
          )}
          {lastPassed === false && (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          {lastPassed == null && (
            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block">{testCase.name}</span>
          <span className="text-xs text-muted-foreground truncate block">
            {testCase.input_message.slice(0, 80)}
            {testCase.input_message.length > 80 && '...'}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 shrink-0">
          {passRate !== null && (
            <span className={cn(
              'text-xs font-medium tabular-nums',
              passRate >= 80 ? 'text-green-600 dark:text-green-400' :
              passRate >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            )}>
              {passRate}% pass
            </span>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {testCase.pass_count}P / {testCase.fail_count}F
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
          {testCase.expected_behavior && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Expected Behavior</p>
              <p className="text-sm">{testCase.expected_behavior}</p>
            </div>
          )}

          {testCase.last_result && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Last Result</p>
              <div className={cn(
                'rounded-md border p-3 text-sm',
                testCase.last_result.passed
                  ? 'border-green-500/20 bg-green-500/5'
                  : 'border-red-500/20 bg-red-500/5'
              )}>
                <p className="whitespace-pre-wrap text-xs">
                  {testCase.last_result.response.slice(0, 500)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(testCase.last_result.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleRun}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 h-7 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {running ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Run
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/5 text-destructive px-3 h-7 text-xs font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Sandbox Screen
// ============================================================================

export function SandboxScreen({ agentId }: { agentId: string }) {
  const [activeTab, setActiveTab] = useState<'chat' | 'tests'>('chat');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border px-1">
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'chat'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <MessageCircle className="h-4 w-4" />
          Sandbox Chat
        </button>
        <button
          onClick={() => setActiveTab('tests')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'tests'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <FlaskConical className="h-4 w-4" />
          Test Cases
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <SandboxChat agentId={agentId} />}
        {activeTab === 'tests' && <TestCaseManager agentId={agentId} />}
      </div>
    </div>
  );
}
