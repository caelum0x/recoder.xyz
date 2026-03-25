"use client";

import { useCallback, useRef, useState } from "react";

export type CopilotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type CopilotStatus = "ready" | "submitted" | "streaming" | "error";

type UseCopilotChatOptions = {
  api: string;
  body: Record<string, unknown>;
  onError?: (err: Error) => void;
};

let nextId = 0;
function generateId(): string {
  nextId += 1;
  return `msg-${Date.now()}-${nextId}`;
}

/**
 * Lightweight chat hook that calls our SSE route directly via fetch.
 *
 * Replaces the AI SDK v5 useChat + DefaultChatTransport combo which has a
 * body-parsing race condition on the second message (Next.js receives 0 bytes
 * and returns 400 in ~1 ms).  By using plain fetch we eliminate that race
 * entirely -- every message works reliably.
 */
export function useCopilotChat({ api, body, onError }: UseCopilotChatOptions) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [status, setStatus] = useState<CopilotStatus>("ready");
  const [error, setError] = useState<Error | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  // Keep a ref that always points to the latest messages so sendMessage
  // never reads a stale closure.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const bodyRef = useRef(body);
  bodyRef.current = body;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: CopilotMessage = {
        id: generateId(),
        role: "user",
        content: trimmed,
      };

      // Build the full messages array for the API (include history)
      const allMessages = [
        ...messagesRef.current.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content: trimmed },
      ];

      // Optimistically append user message
      setMessages((prev) => [...prev, userMsg]);
      setStatus("submitted");
      setError(undefined);

      try {
        const response = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: allMessages,
            ...bodyRef.current,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response
            .text()
            .catch(() => `HTTP ${response.status}`);
          throw new Error(errText || `HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        setStatus("streaming");

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantContent = "";
        const assistantId = generateId();

        // Add an empty assistant message that we will update incrementally
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "" },
        ]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith("data: ")) {
              continue;
            }
            const data = trimmedLine.slice(6);
            if (data === "[DONE]") {
              continue;
            }

            try {
              const parsed = JSON.parse(data);

              // Handle UI Message Stream Protocol (our route format)
              if (
                parsed.type === "text-delta" &&
                typeof parsed.delta === "string"
              ) {
                assistantContent += parsed.delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: assistantContent }
                      : m
                  )
                );
              }

              // Also handle raw OpenRouter format (fallback)
              const rawContent = parsed.choices?.[0]?.delta?.content;
              if (
                typeof rawContent === "string" &&
                rawContent.length > 0 &&
                !parsed.type
              ) {
                assistantContent += rawContent;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: assistantContent }
                      : m
                  )
                );
              }
            } catch {
              // Skip unparseable chunks
            }
          }
        }

        setStatus("ready");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setStatus("ready");
          return;
        }
        const error_ = err instanceof Error ? err : new Error(String(err));
        setError(error_);
        setStatus("error");
        onErrorRef.current?.(error_);
      }
    },
    [api]
  );

  const clearError = useCallback(() => {
    setError(undefined);
    setStatus((prev) => (prev === "error" ? "ready" : prev));
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("ready");
  }, []);

  return { messages, sendMessage, status, error, clearError, stop };
}
