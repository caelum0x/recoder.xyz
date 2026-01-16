import type { Message } from 'ai';
import { useCallback, useState } from 'react';
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
      workbenchStore.updateArtifact(data, { closed: true });

      // 🔄 End snapshot batch when AI finishes artifact
      if (currentArtifactId === data.id) {
        endAIChangesBatch(`AI completed: ${data.title || 'changes'}`).catch(console.error);
        currentArtifactId = null;
        snapshotBeforeChanges = false;
      }
    },
    onActionOpen: (data) => {
      if (data.action.type !== 'shell') {
        workbenchStore.addAction(data);
      }
    },
    onActionClose: (data) => {
      if (data.action.type === 'shell') {
        workbenchStore.addAction(data);
      }
      workbenchStore.runAction(data);
    },
  },
});

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});

  const parseMessages = useCallback((messages: Message[], isLoading: boolean) => {
    let reset = false;

    if (import.meta.env.DEV && !isLoading) {
      reset = true;
      messageParser.reset();
    }

    for (const [index, message] of messages.entries()) {
      if (message.role === 'assistant') {
        const newParsedContent = messageParser.parse(message.id, message.content);

        setParsedMessages((prevParsed) => ({
          ...prevParsed,
          [index]: !reset ? (prevParsed[index] || '') + newParsedContent : newParsedContent,
        }));
      }
    }
  }, []);

  return { parsedMessages, parseMessages };
}
