/**
 * Custom chat hook - NO AI SDK
 * Direct fetch with streaming
 */

import { useState, useCallback, useRef } from 'react';

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

export function useSimpleChat(options: UseChatOptions) {
  const { api, onError, onFinish, onResponse, initialMessages = [] } = options;
  
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

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
      
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage] }),
        signal: abortControllerRef.current.signal,
        credentials: 'include', // CRITICAL: Send cookies for auth
      });

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        
        setMessages(prev => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          const lastMessage = newMessages[lastIndex];
          if (lastMessage && lastMessage.role === 'assistant') {
            // Create new object to trigger React re-render
            newMessages[lastIndex] = {
              ...lastMessage,
              content: lastMessage.content + text,
            };
          }
          return newMessages;
        });
      }

      if (onFinish) {
        onFinish();
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Chat error:', error);
        if (onError) {
          onError(error);
        }
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [api, messages, onError, onFinish, onResponse]);

  return {
    messages,
    isLoading,
    input,
    handleInputChange,
    setInput,
    stop,
    append,
  };
}
