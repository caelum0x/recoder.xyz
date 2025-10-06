'use client';

/**
 * 🚀 Bolt.new Integration - Powered by Claude Sonnet 4.5
 *
 * Complete AI-powered development workbench with:
 * - Claude Sonnet 4.5 via OpenRouter
 * - WebContainer for in-browser execution
 * - Live code preview
 * - Real-time streaming
 */

import { useState, useRef, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import Workbench from '../components/Workbench';
import { useBoltWorkbench } from '@/lib/hooks/useBoltStream';

export default function BoltPage() {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    files,
    setFiles,
    messages,
    sendMessage,
    isStreaming,
    streamedContent,
  } = useBoltWorkbench();

  const chatStarted = messages.length > 0;

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedContent]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(
        textareaRef.current.scrollHeight,
        chatStarted ? 400 : 200
      ) + 'px';
    }
  }, [prompt, chatStarted]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isStreaming) return;

    await sendMessage(prompt, 'premium'); // Use Claude Sonnet 4.5
    setPrompt('');
  };

  const EXAMPLE_PROMPTS = [
    'Build a todo app with React and local storage',
    'Create a weather dashboard with OpenWeather API',
    'Build a markdown editor with live preview',
    'Create a Pomodoro timer with notifications',
  ];

  return (
    <div className="h-screen flex flex-col bg-bolt-elements-background-depth-1">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="flex items-center gap-3">
          <div className="text-2xl">⚡</div>
          <div>
            <h1 className="text-lg font-semibold text-bolt-elements-textPrimary">
              Bolt.new
            </h1>
            <p className="text-xs text-bolt-elements-textSecondary">
              Powered by Claude Sonnet 4.5
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1 bg-bolt-elements-background-depth-3 rounded-lg text-xs text-bolt-elements-textSecondary">
            {files.length} files
          </div>
          <div className="px-3 py-1 bg-bolt-elements-background-depth-3 rounded-lg text-xs text-bolt-elements-textSecondary">
            {messages.length} messages
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Chat Panel */}
          <Panel defaultSize={chatStarted ? 35 : 100} minSize={30}>
            <div className="h-full flex flex-col bg-bolt-elements-background-depth-1">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6">
                {!chatStarted ? (
                  // Welcome Screen
                  <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto">
                    <div className="text-6xl mb-6">⚡</div>
                    <h2 className="text-3xl font-bold text-bolt-elements-textPrimary mb-3">
                      Welcome to Bolt.new
                    </h2>
                    <p className="text-bolt-elements-textSecondary mb-8 text-center">
                      Build full-stack web apps with AI. Powered by Claude Sonnet 4.5,
                      running code directly in your browser.
                    </p>

                    {/* Example Prompts */}
                    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                      {EXAMPLE_PROMPTS.map((example) => (
                        <button
                          key={example}
                          onClick={() => setPrompt(example)}
                          className="p-4 text-left bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 rounded-lg border border-bolt-elements-borderColor transition-colors"
                        >
                          <div className="text-sm text-bolt-elements-textPrimary">
                            {example}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  // Chat Messages
                  <div className="space-y-6">
                    {messages.map((message, index) => (
                      <div
                        key={index}
                        className={`flex ${
                          message.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-4 ${
                            message.role === 'user'
                              ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
                              : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                          }`}
                        >
                          <div className="text-sm whitespace-pre-wrap">
                            {message.content}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Streaming Content */}
                    {isStreaming && streamedContent && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-lg p-4 bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary">
                          <div className="text-sm whitespace-pre-wrap">
                            {streamedContent}
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-bolt-elements-textTertiary">
                            <div className="w-1 h-1 bg-current rounded-full animate-pulse" />
                            <div className="text-xs">Streaming...</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-6 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                <form onSubmit={handleSend} className="flex gap-3">
                  <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={
                      chatStarted
                        ? 'Continue building...'
                        : 'What would you like to build?'
                    }
                    className="flex-1 bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary rounded-lg px-4 py-3 resize-none outline-none focus:ring-2 focus:ring-bolt-elements-focus border border-bolt-elements-borderColor"
                    rows={1}
                    disabled={isStreaming}
                  />
                  <button
                    type="submit"
                    disabled={!prompt.trim() || isStreaming}
                    className="px-6 py-3 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg hover:bg-bolt-elements-button-primary-backgroundHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {isStreaming ? '⏳' : '✨'}
                  </button>
                </form>

                <div className="mt-3 text-xs text-bolt-elements-textTertiary">
                  Using Claude Sonnet 4.5 • Press Enter to send • Shift+Enter for new line
                </div>
              </div>
            </div>
          </Panel>

          {/* Workbench Panel */}
          {chatStarted && (
            <>
              <PanelResizeHandle className="w-1 bg-bolt-elements-borderColor hover:bg-bolt-elements-borderColorHover transition-colors" />
              <Panel defaultSize={65} minSize={40}>
                <Workbench files={files} onFilesChange={setFiles} />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  );
}
