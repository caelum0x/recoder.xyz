"use client";

import { StackCard } from "@repo/design-system/components/stack-card";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { handleError } from "@repo/design-system/lib/handle-error";
import { SendIcon, SparklesIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MemoizedReactMarkdown } from "@/components/markdown";
import { useCopilotChat } from "@/hooks/use-copilot-chat";

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

  const { messages, sendMessage, status, error, clearError } = useCopilotChat({
    api: "/api/insights/chat",
    body: { organizationId },
    onError: (err) => {
      if (!err.message?.includes("Failed to fetch")) {
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
    if (!text || isLoading) {
      return;
    }
    if (error) {
      clearError();
    }
    setLocalInput("");
    sendMessage(text);
  };

  // Prevent hydration mismatch by not rendering until client-side mount
  if (!mounted) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        className="flex items-center gap-2 rounded-lg border border-muted-foreground/25 border-dashed px-4 py-3 text-muted-foreground text-sm transition-colors hover:border-primary/50 hover:text-foreground"
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
            Ask about trends, feature priorities, feedback patterns, or anything
            about your product.
          </p>
        )}
        {messages.map((message) => {
          const isUser = message.role === "user";
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
                  message.content || "\u200B"
                ) : (
                  <MemoizedReactMarkdown>
                    {message.content || "\u200B"}
                  </MemoizedReactMarkdown>
                )}
              </div>
            </div>
          );
        })}
        {isLoading ? (
          <div className="flex justify-start">
            <div className="rounded-lg bg-secondary px-3 py-2 text-muted-foreground text-sm">
              Thinking...
            </div>
          </div>
        ) : null}
        {error !== null && error !== undefined ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-xs">
            <p>{error.message || "An error occurred"}</p>
            <button
              className="mt-1 text-destructive/70 underline hover:text-destructive"
              onClick={() => clearError()}
              type="button"
            >
              Dismiss
            </button>
          </div>
        ) : null}
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
