/**
 * useAgentSession Hook
 *
 * React hook that manages the client-side agent session lifecycle:
 * - Starts agent sessions by calling POST /api/agent
 * - Consumes SSE events and updates the agent-session store
 * - Provides actions: accept, reject, undo, interrupt
 *
 * Follows the same SSE pattern as useSimpleChat.ts
 */

import { useCallback, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  agentSessionStore,
  agentSessionActive,
  startAgentSession,
  setAgentPhase,
  setAgentPlan,
  addFileChange,
  addShellCommand,
  updateShellCommand,
  setVerificationErrors,
  incrementFixIteration,
  setStreamingText,
  completeAgentSession,
  errorAgentSession,
  interruptAgentSession,
  resetAgentSession,
  getSelectedFileChanges,
  setSnapshotId,
  type AgentSession,
  type AgentPhase,
} from '~/lib/stores/agent-session';
import { workbenchStore } from '~/lib/stores/workbench';
import { createSnapshot, restoreSnapshot } from '~/lib/stores/snapshots';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useAgentSession');

interface AgentEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export function useAgentSession() {
  const session = useStore(agentSessionStore);
  const isActive = useStore(agentSessionActive);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Start an agent session
   */
  const startAgent = useCallback(async (prompt: string) => {
    const projectId = workbenchStore.projectId.get();
    if (!projectId) {
      logger.error('[useAgentSession] No project ID');
      return;
    }

    // Create snapshot before agent starts (for undo)
    const snapshot = await createSnapshot(projectId, 'Pre-agent snapshot', 'ai');
    const sessionId = startAgentSession(prompt, projectId);

    if (snapshot) {
      setSnapshotId(snapshot.id);
    }

    // Create abort controller
    abortRef.current = new AbortController();

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          projectId,
          maxFixIterations: 5,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage =
          typeof errorData === 'object' &&
          errorData !== null &&
          'error' in errorData &&
          typeof (errorData as { error?: unknown }).error === 'string'
            ? (errorData as { error: string }).error
            : `HTTP ${response.status}`;
        errorAgentSession(errorMessage);
        return;
      }

      if (!response.body) {
        errorAgentSession('No response body');
        return;
      }

      // Process SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Incomplete line at end
          if (i === lines.length - 1 && !buffer.endsWith('\n')) {
            buffer = line;
            break;
          }

          if (line.startsWith('data: ')) {
            try {
              const event: AgentEvent = JSON.parse(line.slice(6));
              handleAgentEvent(event);
            } catch {
              // Not valid JSON - skip
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        logger.info('[useAgentSession] Session aborted');
      } else {
        errorAgentSession(e.message || 'Connection failed');
      }
    }
  }, []);

  /**
   * Handle an incoming agent event
   */
  const handleAgentEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case 'phase': {
        const phase = event.data.phase as AgentPhase;
        const detail = event.data.detail as string | undefined;
        setAgentPhase(phase, detail);

        if (phase === 'fixing') {
          incrementFixIteration();
        }
        break;
      }

      case 'plan': {
        const plan = event.data.plan as any;
        if (plan) {
          setAgentPlan({
            title: plan.title,
            summary: plan.summary,
            steps: (plan.steps || []).map((s: any, i: number) => ({
              id: `plan-step-${i}`,
              description: s.description,
              type: s.type || 'modify',
              targetFile: s.targetFile,
              status: 'pending' as const,
            })),
            estimatedFiles: (plan.steps || []).filter((s: any) =>
              ['create', 'modify', 'delete'].includes(s.type),
            ).length,
            estimatedCommands: (plan.steps || []).filter((s: any) => s.type === 'shell').length,
          });
        }
        break;
      }

      case 'file_change': {
        addFileChange({
          path: event.data.path as string,
          type: event.data.type as 'create' | 'update' | 'delete',
          oldContent: event.data.oldContent as string | undefined,
          newContent: event.data.newContent as string | undefined,
          summary: event.data.summary as string | undefined,
        });
        break;
      }

      case 'shell_start': {
        addShellCommand({
          command: event.data.command as string,
        });
        break;
      }

      case 'shell_complete': {
        updateShellCommand(event.data.id as string, {
          output: event.data.output as string,
          exitCode: event.data.exitCode as number,
          status: (event.data.exitCode as number) === 0 ? 'complete' : 'error',
          completedAt: Date.now(),
        });
        break;
      }

      case 'verify_result': {
        const errors = (event.data.errors as string[]) || [];
        setVerificationErrors(errors);
        break;
      }

      case 'streaming_text': {
        setStreamingText(event.data.text as string);
        break;
      }

      case 'error': {
        errorAgentSession(event.data.message as string);
        break;
      }

      case 'complete': {
        if (event.data.success) {
          setAgentPhase('reviewing');
        } else {
          setAgentPhase('reviewing', `Completed with ${(event.data.errors as string[])?.length || 0} remaining errors`);
        }
        completeAgentSession();
        break;
      }
    }
  }, []);

  /**
   * Accept selected file changes
   */
  const acceptChanges = useCallback(async () => {
    const selected = getSelectedFileChanges();
    const projectId = session.projectId;

    if (!projectId || selected.length === 0) return;

    // Files are already written to Docker during execution.
    // For rejected files, we restore their old content.
    const allChanges = agentSessionStore.get().fileChanges;
    const rejected = allChanges.filter((f) => !f.selected);

    for (const file of rejected) {
      if (file.oldContent !== undefined) {
        try {
          await fetch('/api/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'revert-file',
              projectId,
              path: file.path,
              content: file.oldContent,
            }),
          });
        } catch {
          // Best effort revert
        }
      }
    }

    // Create post-agent snapshot
    await createSnapshot(projectId, `Agent: ${session.prompt.slice(0, 50)}`, 'ai');

    resetAgentSession();
    logger.info(`[useAgentSession] Accepted ${selected.length} files, reverted ${rejected.length}`);
  }, [session.projectId, session.prompt]);

  /**
   * Reject all changes and restore to pre-agent snapshot
   */
  const rejectChanges = useCallback(async () => {
    const projectId = session.projectId;
    const snapshotId = session.snapshotId;

    if (projectId && snapshotId) {
      await restoreSnapshot(projectId, snapshotId);
      logger.info('[useAgentSession] Restored to pre-agent snapshot');
    }

    resetAgentSession();
  }, [session.projectId, session.snapshotId]);

  /**
   * Interrupt the running agent
   */
  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    interruptAgentSession();
    logger.info('[useAgentSession] Interrupted');
  }, []);

  /**
   * Close/dismiss the agent session
   */
  const dismiss = useCallback(() => {
    resetAgentSession();
  }, []);

  return {
    session,
    isActive,
    startAgent,
    acceptChanges,
    rejectChanges,
    interrupt,
    dismiss,
  };
}
