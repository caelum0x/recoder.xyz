"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { handleError } from "@repo/design-system/lib/handle-error";
import { SparklesIcon, SendIcon, XIcon, MessageSquareIcon } from "lucide-react";
import { useMemo, useState, useRef, useEffect } from "react";

interface AiCopilotChatProps {
  organizationId: string;
}

function CopilotChatPanel({ organizationId, onClose }: { organizationId: string; onClose: () => void }) {
  const [localInput, setLocalInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      // Suppress transient 400 errors (Next.js body parsing race on second message)
      // The user can just resend — it works on retry.
      if (err?.message && !err.message.includes("Failed to fetch") && !err.message.includes("400")) {
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
    if (!value || isLoading) return;
    if (error) {
      clearError();
    }
    setLocalInput("");
    sendMessage({ text: value });
  };

  // Derive a user-friendly error message
  const errorMessage = error
    ? error.message?.includes("Failed to fetch")
      ? "Could not reach the AI service. Please try again."
      : error.message || "An error occurred"
    : null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-96 flex-col rounded-2xl border border-border bg-background shadow-2xl"
      style={{ maxHeight: "70vh" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3">
        <div className="flex items-center gap-2 text-white">
          <SparklesIcon className="size-4" />
          <span className="text-sm font-semibold">PM Co-pilot</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-white/70 hover:text-white transition-colors"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: "200px", maxHeight: "50vh" }}>
        {messages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquareIcon className="size-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Ask me about your product data</p>
            <div className="mt-3 space-y-1 text-xs">
              <button
                type="button"
                onClick={() => handleSend("What are the top priorities based on feedback?")}
                className="block w-full rounded-lg border border-border px-3 py-1.5 text-left hover:bg-accent transition-colors"
              >
                What are the top priorities based on feedback?
              </button>
              <button
                type="button"
                onClick={() => handleSend("Summarize recent user sentiment")}
                className="block w-full rounded-lg border border-border px-3 py-1.5 text-left hover:bg-accent transition-colors"
              >
                Summarize recent user sentiment
              </button>
              <button
                type="button"
                onClick={() => handleSend("What should we build next?")}
                className="block w-full rounded-lg border border-border px-3 py-1.5 text-left hover:bg-accent transition-colors"
              >
                What should we build next?
              </button>
            </div>
          </div>
        )}
        {messages.map((m) => {
          const content = m.parts
            ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map((p) => p.text)
            .join("") ?? "";

          return (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                <div className="whitespace-pre-wrap">{content || "\u200B"}</div>
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="size-1.5 rounded-full bg-purple-500 animate-pulse" />
                <div className="size-1.5 rounded-full bg-blue-500 animate-pulse [animation-delay:0.2s]" />
                <div className="size-1.5 rounded-full bg-purple-500 animate-pulse [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
        {errorMessage && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <p>{errorMessage}</p>
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

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="border-t border-border p-3"
      >
        <div className="flex gap-2">
          <input
            value={localInput}
            onChange={(e) => setLocalInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about your product..."
            className="flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-purple-500/30"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !localInput.trim()}
            className="rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-2 text-white disabled:opacity-50 hover:from-purple-700 hover:to-blue-700 transition-all"
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
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 text-sm font-medium text-white shadow-lg hover:from-purple-700 hover:to-blue-700 transition-all hover:scale-105"
      >
        <SparklesIcon className="size-4" />
        AI Co-pilot
      </button>
    );
  }

  return <CopilotChatPanel organizationId={organizationId} onClose={() => setIsOpen(false)} />;
}
