/**
 * 🚀 useBoltStream Hook
 *
 * React hook for streaming AI responses with artifact extraction
 */

import { useState, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Artifact {
  files: Array<{ path: string; content: string }>;
  shellCommands: string[];
}

interface UseBoltStreamOptions {
  onArtifacts?: (artifacts: Artifact) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

export function useBoltStream(options: UseBoltStreamOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const [artifacts, setArtifacts] = useState<Artifact | null>(null);

  const stream = useCallback(
    async (
      messages: Message[],
      model: 'premium' | 'fast' | 'free' | 'coding' = 'premium'
    ) => {
      setIsStreaming(true);
      setStreamedContent('');
      setArtifacts(null);

      try {
        const response = await fetch('/api/bolt-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages,
            model,
            maxTokens: 16000,
          }),
        });

        if (!response.ok) {
          throw new Error(`Stream failed: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                options.onComplete?.(fullResponse);
                continue;
              }

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === 'text') {
                  fullResponse += parsed.content;
                  setStreamedContent(fullResponse);
                } else if (parsed.type === 'artifacts') {
                  const artifactData = {
                    files: parsed.files,
                    shellCommands: parsed.shellCommands,
                  };
                  setArtifacts(artifactData);
                  options.onArtifacts?.(artifactData);
                }
              } catch (e) {
                console.warn('Failed to parse stream data:', e);
              }
            }
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Stream failed');
        options.onError?.(err);
        console.error('Bolt stream error:', err);
      } finally {
        setIsStreaming(false);
      }
    },
    [options]
  );

  return {
    stream,
    isStreaming,
    streamedContent,
    artifacts,
  };
}

/**
 * 🎨 useBoltWorkbench Hook
 *
 * Combined hook for Workbench + Bolt AI streaming
 */
export function useBoltWorkbench() {
  const [files, setFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const { stream, isStreaming, streamedContent, artifacts } = useBoltStream({
    onArtifacts: (artifacts) => {
      // Automatically add generated files to workbench
      if (artifacts.files.length > 0) {
        setFiles(prev => {
          const newFiles = [...prev];

          artifacts.files.forEach(newFile => {
            const existingIndex = newFiles.findIndex(f => f.path === newFile.path);
            if (existingIndex >= 0) {
              newFiles[existingIndex] = newFile;
            } else {
              newFiles.push(newFile);
            }
          });

          return newFiles;
        });
      }
    },
    onComplete: (fullResponse) => {
      setMessages(prev => [...prev, { role: 'assistant', content: fullResponse }]);
    },
  });

  const sendMessage = useCallback(
    async (content: string, model: 'premium' | 'fast' | 'free' | 'coding' = 'premium') => {
      const userMessage: Message = { role: 'user', content };
      setMessages(prev => [...prev, userMessage]);

      await stream([...messages, userMessage], model);
    },
    [messages, stream]
  );

  return {
    // Files
    files,
    setFiles,

    // Messages
    messages,
    sendMessage,

    // Streaming
    isStreaming,
    streamedContent,
    artifacts,
  };
}
