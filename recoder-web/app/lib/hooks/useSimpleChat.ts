/**
 * Custom chat hook - NO AI SDK
 * Direct fetch with streaming
 * 
 * FIXES:
 * 1. Use immutable message updates (spread operator) instead of mutation
 * 2. Create complete message object at end of streaming for reliable persistence
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'function' | 'data' | 'tool';
  content: string;
  createdAt?: Date;
}

interface UseChatOptions {
  api: string;
  body?: Record<string, unknown>;
  onError?: (error: Error) => void;
  onFinish?: (message: Message) => void; // Now passes the final assistant message
  onResponse?: (response: Response) => void;
  initialMessages?: Message[];
}

export function useSimpleChat(options: UseChatOptions) {
  const { api, body: extraBody, onError, onFinish, onResponse, initialMessages = [] } = options;
  
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // 🔧 FIX: Track accumulated content separately to avoid mutation issues
  const accumulatedContentRef = useRef<string>('');
  const currentAssistantIdRef = useRef<string>('');

  // Reset messages when initialMessages change (e.g., loading a different chat)
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

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
      id: `user-${Date.now()}`,
      createdAt: new Date(),
    };

    // 🔧 FIX: Reset accumulated content for new message
    accumulatedContentRef.current = '';
    const assistantId = `assistant-${Date.now() + 1}`;
    currentAssistantIdRef.current = assistantId;

    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    try {
      abortControllerRef.current = new AbortController();
      
      // Include all messages including the new user message
      const allMessages = [...messages, userMessage];
      
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages, ...extraBody }),
        signal: abortControllerRef.current.signal,
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
        
        // 🔧 FIX: Accumulate content in ref (not mutating state)
        accumulatedContentRef.current += text;
        const currentContent = accumulatedContentRef.current;
        
        // 🔧 FIX: Use immutable update - create new message object
        setMessages(prev => {
          return prev.map(msg => 
            msg.id === assistantId 
              ? { ...msg, content: currentContent }
              : msg
          );
        });
      }

      // 🔧 FIX: Create final message with complete content for persistence
      const finalAssistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: accumulatedContentRef.current,
        createdAt: new Date(),
      };

      // Final update to ensure complete message is in state
      setMessages(prev => {
        return prev.map(msg => 
          msg.id === assistantId 
            ? finalAssistantMessage
            : msg
        );
      });

      if (onFinish) {
        onFinish(finalAssistantMessage);
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
  }, [api, messages, extraBody, onError, onFinish, onResponse]);

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
