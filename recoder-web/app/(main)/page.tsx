"use client";

export const dynamic = 'force-dynamic';

import { use, useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createChat } from "./actions";
import { Context } from "./providers";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

export default function Home() {
  const { setStreamPromise } = use(Context);
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useState<Array<{ role: string; content: string; isError?: boolean }>>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const EXAMPLE_PROMPTS = [
    "Todo app with React",
    "Weather dashboard",
    "Calculator app",
    "Portfolio website",
  ];

  const chatStarted = messages.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, chatStarted ? 400 : 200) + 'px';
    }
  }, [prompt, chatStarted]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isPending) return;

    const userMessage = prompt;
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setPrompt("");
    setShowPreview(true);

    startTransition(async () => {
      try {
        const { chatId, lastMessageId } = await createChat(
          userMessage,
          "deepseek-ai/DeepSeek-V3",
          "high",
          undefined
        );

        // Add assistant message placeholder
        setMessages(prev => [...prev, { role: "assistant", content: "Generating your app..." }]);

        const streamPromise = fetch(
          "/api/get-next-completion-stream-promise",
          {
            method: "POST",
            body: JSON.stringify({
              messageId: lastMessageId,
              model: "deepseek-ai/DeepSeek-V3"
            }),
          }
        ).then((res) => {
          if (!res.body) throw new Error("No body on response");
          return res.body;
        });

        startTransition(() => {
          setStreamPromise(streamPromise);
          router.push(`/chats/${chatId}`);
        });
      } catch (error) {
        console.error("Failed to create chat:", error);
        setMessages(prev => [
          ...prev.slice(0, -1),
          {
            role: "assistant",
            content: `Error: ${error instanceof Error ? error.message : "Failed to generate app. Please check your API keys in .env.local"}`,
            isError: true
          }
        ]);
      }
    });
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white overflow-hidden">
      {/* Sidebar */}
      {!sidebarCollapsed && (
        <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 rounded-lg flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <span className="font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Recoder</span>
            </div>
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              title="Hide sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <button
              onClick={() => {
                setMessages([]);
                setShowPreview(false);
                setPrompt("");
              }}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors text-white shadow-sm"
            >
              New
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area with Resizable Panels */}
      <div className="flex-1 flex flex-col">
        {/* Top bar with sidebar toggle */}
        {sidebarCollapsed && (
          <div className="border-b border-gray-200 dark:border-gray-700 p-2 bg-white dark:bg-gray-800">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="px-3 py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Show sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}

        {/* Resizable Split View */}
        {chatStarted && showPreview ? (
          <PanelGroup direction="horizontal" className="flex-1">
            {/* Chat Panel */}
            <Panel defaultSize={60} minSize={30}>
              <div className="h-full flex flex-col">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-6">
                  <div className="max-w-3xl mx-auto space-y-6">
                    {messages.map((msg, idx) => (
                      <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                          </div>
                        )}
                        <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : msg.isError
                            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-300'
                            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm'
                        }`}>
                          <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                        </div>
                        {msg.role === 'user' && (
                          <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Input Area */}
                <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
                  <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto">
                    <div className="relative bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm hover:border-gray-400 dark:hover:border-gray-500 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                      <textarea
                        ref={textareaRef}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="Describe what you want to build..."
                        className="w-full px-4 pt-4 pb-12 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none"
                        style={{ minHeight: '76px' }}
                        disabled={isPending}
                        rows={1}
                      />
                      <div className="absolute bottom-2 right-2">
                        <button
                          type="submit"
                          disabled={!prompt.trim() || isPending}
                          className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors text-white"
                        >
                          {isPending ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </Panel>

            {/* Resize Handle */}
            <PanelResizeHandle className="w-1 bg-gray-300 dark:bg-gray-700 hover:bg-blue-500 transition-colors cursor-col-resize" />

            {/* Preview Panel */}
            <Panel defaultSize={40} minSize={20}>
              <div className="h-full bg-white dark:bg-gray-800 flex flex-col">
                <div className="flex items-center justify-end px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setShowPreview(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 bg-gray-50 dark:bg-gray-900"></div>
              </div>
            </Panel>
          </PanelGroup>
        ) : (
          /* Single Column View (no preview or no chat) */
          <div className="flex-1 flex flex-col">
            {/* Messages or Welcome Screen */}
            <div className="flex-1 overflow-y-auto">
              {!chatStarted ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-3xl px-4">
                    <div className="grid grid-cols-2 gap-2 mb-20">
                      {EXAMPLE_PROMPTS.map((example) => (
                        <button
                          key={example}
                          onClick={() => setPrompt(example)}
                          className="p-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg text-sm transition-all shadow-sm hover:shadow text-gray-700 dark:text-gray-300"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-6">
                  <div className="max-w-3xl mx-auto space-y-6">
                    {messages.map((msg, idx) => (
                      <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                          </div>
                        )}
                        <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : msg.isError
                            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-300'
                            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm'
                        }`}>
                          <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                        </div>
                        {msg.role === 'user' && (
                          <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className={`border-t border-gray-200 dark:border-gray-700 p-4 ${chatStarted ? 'bg-white dark:bg-gray-800' : 'bg-transparent'}`}>
              <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto">
                <div className="relative bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm hover:border-gray-400 dark:hover:border-gray-500 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                  <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="What do you want to build?"
                    className="w-full px-4 pt-4 pb-12 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none"
                    style={{ minHeight: '76px' }}
                    disabled={isPending}
                    rows={1}
                  />
                  <div className="absolute bottom-2 right-2">
                    <button
                      type="submit"
                      disabled={!prompt.trim() || isPending}
                      className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors text-white"
                    >
                      {isPending ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const runtime = "edge";
export const maxDuration = 45;
