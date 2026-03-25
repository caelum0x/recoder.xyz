"use client";

import { handleError } from "@repo/design-system/lib/handle-error";
import { MessageSquareIcon, SendIcon, SparklesIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCopilotChat } from "@/hooks/use-copilot-chat";

type AiCopilotChatProps = {
  organizationId: string;
};

function CopilotChatPanel({
  organizationId,
  onClose,
}: {
  organizationId: string;
  onClose: () => void;
}) {
  const [localInput, setLocalInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleSend = (text?: string) => {
    const value = (text ?? localInput).trim();
    if (!value || isLoading) {
      return;
    }
    if (error) {
      clearError();
    }
    setLocalInput("");
    sendMessage(value);
  };

  // Derive a user-friendly error message
  let errorMessage: string | null = null;
  if (error) {
    errorMessage = error.message?.includes("Failed to fetch")
      ? "Could not reach the AI service. Please try again."
      : error.message || "An error occurred";
  }

  return (
    <div
      className="fixed right-6 bottom-6 z-50 flex w-96 flex-col rounded-2xl border border-border bg-background shadow-2xl"
      style={{ maxHeight: "70vh" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3">
        <div className="flex items-center gap-2 text-white">
          <SparklesIcon className="size-4" />
          <span className="font-semibold text-sm">PM Co-pilot</span>
        </div>
        <button
          className="text-white/70 transition-colors hover:text-white"
          onClick={onClose}
          type="button"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 space-y-3 overflow-y-auto p-4"
        style={{ minHeight: "200px", maxHeight: "50vh" }}
      >
        {messages.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            <MessageSquareIcon className="mx-auto mb-2 size-8 opacity-30" />
            <p className="text-sm">Ask me about your product data</p>
            <div className="mt-3 space-y-1 text-xs">
              <button
                className="block w-full rounded-lg border border-border px-3 py-1.5 text-left transition-colors hover:bg-accent"
                onClick={() =>
                  handleSend("What are the top priorities based on feedback?")
                }
                type="button"
              >
                What are the top priorities based on feedback?
              </button>
              <button
                className="block w-full rounded-lg border border-border px-3 py-1.5 text-left transition-colors hover:bg-accent"
                onClick={() => handleSend("Summarize recent user sentiment")}
                type="button"
              >
                Summarize recent user sentiment
              </button>
              <button
                className="block w-full rounded-lg border border-border px-3 py-1.5 text-left transition-colors hover:bg-accent"
                onClick={() => handleSend("What should we build next?")}
                type="button"
              >
                What should we build next?
              </button>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            key={m.id}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content || "\u200B"}</div>
            </div>
          </div>
        ))}
        {isLoading ? (
          <div className="flex justify-start">
            <div className="rounded-xl bg-muted px-3 py-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="size-1.5 animate-pulse rounded-full bg-purple-500" />
                <div className="size-1.5 animate-pulse rounded-full bg-blue-500 [animation-delay:0.2s]" />
                <div className="size-1.5 animate-pulse rounded-full bg-purple-500 [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        ) : null}
        {errorMessage !== null ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-xs">
            <p>{errorMessage}</p>
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

      {/* Input */}
      <form
        className="border-border border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-foreground text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-purple-500/30"
            disabled={isLoading}
            onChange={(e) => setLocalInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about your product..."
            value={localInput}
          />
          <button
            className="rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-2 text-white transition-all hover:from-purple-700 hover:to-blue-700 disabled:opacity-50"
            disabled={isLoading || !localInput.trim()}
            type="submit"
          >
            <SendIcon className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

export function AiCopilotChat({ organizationId }: AiCopilotChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch by not rendering until client-side mount
  if (!mounted) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 font-medium text-sm text-white shadow-lg transition-all hover:scale-105 hover:from-purple-700 hover:to-blue-700"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <SparklesIcon className="size-4" />
        AI Co-pilot
      </button>
    );
  }

  return (
    <CopilotChatPanel
      onClose={() => setIsOpen(false)}
      organizationId={organizationId}
    />
  );
}
