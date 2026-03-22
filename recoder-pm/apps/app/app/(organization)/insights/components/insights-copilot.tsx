"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { handleError } from "@repo/design-system/lib/handle-error";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Input } from "@repo/design-system/components/ui/input";
import { Button } from "@repo/design-system/components/ui/button";
import { SparklesIcon, SendIcon, XIcon } from "lucide-react";
import { useMemo, useState, useRef, useEffect } from "react";
import { MemoizedReactMarkdown } from "@/components/markdown";

type InsightsCopilotProps = {
  readonly organizationId: string;
};

export const InsightsCopilot = ({ organizationId }: InsightsCopilotProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localInput, setLocalInput] = useState("");
  const [mounted, setMounted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/insights/chat",
        body: { organizationId },
      }),
    [organizationId]
  );

  const { messages, sendMessage, status, error, clearError } = useChat({
    transport,
    onError: (err) => {
      if (err?.message && !err.message.includes("Failed to fetch")) {
        handleError(err);
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = localInput.trim();
    if (!text || isLoading) return;
    if (error) {
      clearError();
    }
    setLocalInput("");
    sendMessage({ text });
  };

  // Prevent hydration mismatch by not rendering until client-side mount
  if (!mounted) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/25 px-4 py-3 text-muted-foreground text-sm transition-colors hover:border-primary/50 hover:text-foreground"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <SparklesIcon className="h-4 w-4" />
        Ask AI about your product insights...
      </button>
    );
  }

  return (
    <StackCard className="relative">
      <button
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        onClick={() => setIsOpen(false)}
        type="button"
      >
        <XIcon className="h-4 w-4" />
      </button>

      <div className="mb-3 flex items-center gap-2">
        <SparklesIcon className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">AI Product Co-pilot</span>
      </div>

      <div className="mb-3 max-h-80 space-y-3 overflow-y-auto rounded-lg bg-muted/30 p-3">
        {messages.length === 0 && (
          <p className="text-center text-muted-foreground text-xs">
            Ask about trends, feature priorities, feedback patterns, or anything about your product.
          </p>
        )}
        {messages.map((message) => {
          const isUser = message.role === "user";
          const content = message.parts
            ?.filter(
              (part): part is { type: "text"; text: string } => part.type === "text"
            )
            .map((p) => p.text)
            .join("") ?? "";

          return (
            <div
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              key={message.id}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  isUser
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-foreground"
                }`}
              >
                {isUser ? (
                  content || "\u200B"
                ) : (
                  <MemoizedReactMarkdown>{content || "\u200B"}</MemoizedReactMarkdown>
                )}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-secondary px-3 py-2 text-muted-foreground text-sm">
              Thinking...
            </div>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <p>{error.message || "An error occurred"}</p>
            <button
              type="button"
              onClick={() => clearError()}
              className="mt-1 underline text-destructive/70 hover:text-destructive"
            >
              Dismiss
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2">
        <Input
          className="flex-1"
          disabled={isLoading}
          onChange={(e) => setLocalInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="What are the top feature requests?"
          value={localInput}
        />
        <Button
          disabled={!localInput.trim() || isLoading}
          onClick={handleSend}
          size="icon"
          variant="default"
        >
          <SendIcon className="h-4 w-4" />
        </Button>
      </div>
    </StackCard>
  );
};
