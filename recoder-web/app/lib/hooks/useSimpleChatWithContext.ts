/**
 * Enhanced chat hook with .recoder/ context support
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { webcontainer } from '~/lib/webcontainer';
import { integrateRecoderContext } from '~/lib/recoder-context/webcontainer-integration';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'function' | 'data' | 'tool';
  content: string;
  createdAt?: Date;
}

interface UseChatOptions {
  api: string;
  onError?: (error: Error) => void;
  onFinish?: () => void;
  onResponse?: (response: Response) => void;
  initialMessages?: Message[];
}

export function useSimpleChatWithContext(options: UseChatOptions) {
  const { api, onError, onFinish, onResponse, initialMessages = [] } = options;
  
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [recoderContext, setRecoderContext] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load .recoder/ context on mount and when messages change
  useEffect(() => {
    loadRecoderContext();
  }, [messages.length]);

  const loadRecoderContext = async () => {
    try {
      const wc = await webcontainer as any;
      const contextPrompt = await integrateRecoderContext(
        {
          readFile: (path: string, encoding?: string) => wc.fs.readFile(path, encoding || 'utf-8'),
          writeFile: (path: string, content: string) => wc.fs.writeFile(path, content),
          mkdir: (path: string, options?: any) => wc.fs.mkdir(path, options),
          readdir: (path: string) => wc.fs.readdir(path),
        },
        messages.length === 0 // isFirstMessage
      );
      setRecoderContext(contextPrompt);
    } catch (error) {
      console.error('Failed to load .recoder/ context:', error);
      setRecoderContext('');
    }
  };

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const append = useCallback(async (message: Omit<Message, 'id' | 'createdAt'>) => {
    const userMessage: Message = {
      ...message,
      id: Date.now().toString(),
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      abortControllerRef.current = new AbortController();

      // Initial connection timeout (60s - server proxy handles Cloudflare limits)
      let timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort();
      }, 60000);

      try {
        const response = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMessage],
            recoderContext, // Include .recoder/ context
          }),
          signal: abortControllerRef.current.signal,
        });

        clearTimeout(timeoutId);

        if (onResponse) {
          onResponse(response);
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Streaming timeout - reset whenever data is received (30s idle timeout)
        let streamingTimeoutId: ReturnType<typeof setTimeout> | null = null;
        const resetStreamingTimeout = () => {
          if (streamingTimeoutId) clearTimeout(streamingTimeoutId);
          streamingTimeoutId = setTimeout(() => {
            abortControllerRef.current?.abort();
          }, 30000); // 30s idle timeout during streaming
        };

        while (true) {
          resetStreamingTimeout(); // Reset timeout on each chunk
          const { done, value } = await reader.read();
          if (done) {
            if (streamingTimeoutId) clearTimeout(streamingTimeoutId);
            break;
          }

          const text = decoder.decode(value);

          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              lastMessage.content += text;
            }
            return newMessages;
          });
        }

        if (onFinish) {
          onFinish();
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        const timeoutError = new Error('Request timed out. The response is taking too long. Please try a shorter message or simpler request.');
        console.error('Chat timeout:', timeoutError);
        if (onError) {
          onError(timeoutError);
        }
        // Update the assistant message to show timeout error
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant') {
            lastMessage.content = '⚠️ Request timed out. Please try a shorter message or simpler request.';
          }
          return newMessages;
        });
      } else {
        console.error('Chat error:', error);
        if (onError) {
          onError(error);
        }
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [api, messages, recoderContext, onError, onFinish, onResponse]);

  return {
    messages,
    isLoading,
    input,
    handleInputChange,
    setInput,
    stop,
    append,
    recoderContext, // Expose context for debugging
  };
}
