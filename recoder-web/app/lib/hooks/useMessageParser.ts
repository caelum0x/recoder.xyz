import type { Message } from 'ai';
import { useCallback, useState, useRef } from 'react';
import { StreamingMessageParser } from '~/lib/runtime/message-parser';
import { workbenchStore } from '~/lib/stores/workbench';
import {
  startAIChangesBatch,
  endAIChangesBatch,
  createSnapshot
} from '~/lib/stores/snapshots';

// Track the current AI artifact for snapshot management
let currentArtifactId: string | null = null;
let snapshotBeforeChanges: boolean = false;

const messageParser = new StreamingMessageParser({
  callbacks: {
    onArtifactOpen: (data) => {
      console.log('🎨 [MessageParser] Artifact opened:', data.id, data.title);
      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact(data);

      // 🔄 Start snapshot batch when AI begins making changes
      // Use defensive check - getProjectId might not exist during SSR/HMR
      const projectId = typeof workbenchStore.getProjectId === 'function'
        ? workbenchStore.getProjectId()
        : null;
      if (projectId) {
        currentArtifactId = data.id;
        snapshotBeforeChanges = true;
        startAIChangesBatch(projectId, `AI changes: ${data.title || 'artifact'}`);
      }
    },
    onArtifactClose: (data) => {
      console.log('🎨 [MessageParser] Artifact closed:', data.id, data.title);
      workbenchStore.updateArtifact(data, { closed: true });

      // 🔄 End snapshot batch when AI finishes artifact
      if (currentArtifactId === data.id) {
        endAIChangesBatch(`AI completed: ${data.title || 'changes'}`).catch(console.error);
        currentArtifactId = null;
        snapshotBeforeChanges = false;
      }
    },
    onActionOpen: (data) => {
      console.log('🔧 [MessageParser] Action opened:', data.action.type, data.action.type === 'file' ? (data.action as any).filePath : '');
      if (data.action.type !== 'shell') {
        workbenchStore.addAction(data);
      }
    },
    onActionClose: (data) => {
      console.log('🔧 [MessageParser] Action closed:', data.action.type, data.action.type === 'file' ? (data.action as any).filePath : '');
      if (data.action.type === 'shell') {
        workbenchStore.addAction(data);
      }
      console.log('🔧 [MessageParser] Calling workbenchStore.runAction for:', data.action.type);
      workbenchStore.runAction(data);
    },
  },
});

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});

  // PERFORMANCE: Track last parsed message lengths to avoid re-parsing unchanged messages
  const lastParsedLengthsRef = useRef<Map<string, number>>(new Map());
  // Track whether we've logged the final stats for each message
  const statsLoggedRef = useRef<Set<string>>(new Set());

  const parseMessages = useCallback((messages: Message[], isLoading: boolean) => {
    for (const [index, message] of messages.entries()) {
      if (message.role === 'assistant') {
        // Skip re-parsing messages that haven't changed
        const lastLength = lastParsedLengthsRef.current.get(message.id) || 0;
        if (message.content.length === lastLength) {
          continue;
        }

        const newParsedContent = messageParser.parse(message.id, message.content);
        lastParsedLengthsRef.current.set(message.id, message.content.length);

        setParsedMessages((prevParsed) => ({
          ...prevParsed,
          [index]: (prevParsed[index] || '') + newParsedContent,
        }));

        // Log stats once when streaming completes
        if (!isLoading && !statsLoggedRef.current.has(message.id)) {
          statsLoggedRef.current.add(message.id);
          const stats = messageParser.getStats(message.id);
          if (stats) {
            if (stats.artifactsFound > 0) {
              console.log(
                `✅ [MessageParser] Message ${message.id}: ${stats.artifactsFound} artifact(s), ${stats.actionsFound} action(s) detected in ${message.content.length} chars`
              );
            } else {
              console.warn(
                `⚠️ [MessageParser] Message ${message.id}: NO artifacts detected in ${message.content.length} chars. ` +
                `First 300 chars: ${message.content.substring(0, 300)}`
              );
            }
          }
        }
      }
    }
  }, []);

  return { parsedMessages, parseMessages };
}
