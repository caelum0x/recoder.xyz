/**
 * Enhanced BaseChat with scroll fixes and full-screen support
 * Drop-in replacement for BaseChat.tsx
 */

import type { Message } from 'ai';
import React, { type RefCallback, useRef } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { IconButton } from '~/components/ui/IconButton';
import { Workbench } from '~/components/workbench/Workbench.client';
import { classNames } from '~/utils/classNames';
import { Messages } from './Messages.client';
import { SendButton } from './SendButton.client';
import { ModelSelector } from './ModelSelector';
import { GitHubBar } from './GitHubBar';
import { useAutoScroll } from '~/hooks/useAutoScroll';
import { useFullScreen } from '~/hooks/useFullScreen';

import styles from './BaseChat.module.scss';

interface BaseChatProps {
  chatId?: string;
  projectId?: string;
  projectName?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  messages?: Message[];
  input?: string;
  selectedProvider?: string;
  selectedModel?: string;
  onProviderChange?: (provider: string) => void;
  onModelChange?: (model: string) => void;
  onSettingsClick?: () => void;
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

export const BaseChatEnhanced = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      chatId,
      projectId,
      projectName,
      textareaRef,
      messageRef,
      scrollRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      messages,
      input = '',
      selectedProvider = 'openrouter',
      selectedModel = 'google/gemini-2.0-flash-001',
      onProviderChange = () => {},
      onModelChange = () => {},
      onSettingsClick = () => {},
      sendMessage,
      handleInputChange,
      handleStop,
    },
    ref,
  ) => {
    const messagesEndRef = useAutoScroll(messages);
    const { isFullScreen, toggleFullScreen } = useFullScreen();

    return (
      <div
        ref={ref}
        className={classNames(
          styles.BaseChat,
          'relative flex h-full w-full overflow-hidden bg-bolt-elements-background-depth-1',
        )}
        data-chat-visible={showChat}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        
        {/* Full-screen toggle */}
        <button
          onClick={toggleFullScreen}
          className="absolute top-4 right-4 z-50 p-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg hover:bg-bolt-elements-item-backgroundHover"
          title={isFullScreen ? 'Exit full-screen' : 'Enter full-screen'}
        >
          {isFullScreen ? '⊗' : '⛶'}
        </button>

        <div ref={scrollRef} className="flex overflow-y-auto w-full h-full scroll-smooth">
          <div className={classNames(styles.Chat, 'flex flex-col flex-grow min-w-[var(--chat-min-width)] h-full')}>
            {!chatStarted && (
              <div id="intro" className="mt-[26vh] max-w-chat mx-auto">
                <h1 className="text-5xl text-center font-bold text-bolt-elements-textPrimary mb-2">
                  Where ideas begin
                </h1>
                <p className="mb-4 text-center text-bolt-elements-textSecondary">
                  Bring ideas to life in seconds or get help on existing projects.
                </p>
              </div>
            )}
            <div
              className={classNames('pt-6 px-6', {
                'h-full flex flex-col': chatStarted,
              })}
            >
              <ClientOnly>
                {() => {
                  return chatStarted ? (
                    <div className="flex flex-col flex-1 overflow-y-auto max-h-[calc(100vh-200px)] scroll-smooth">
                      <Messages
                        ref={messageRef}
                        className="flex flex-col w-full flex-1 max-w-chat px-4 pb-6 mx-auto z-1"
                        messages={messages}
                        isStreaming={isStreaming}
                      />
                      <div ref={messagesEndRef} />
                    </div>
                  ) : null;
                }}
              </ClientOnly>
              <div
                className={classNames('relative w-full max-w-chat mx-auto z-prompt', {
                  'sticky bottom-0': chatStarted,
                })}
              >
                <div
                  className={classNames(
                    'shadow-sm border border-bolt-elements-borderColor bg-bolt-elements-prompt-background backdrop-filter backdrop-blur-[8px] rounded-lg overflow-hidden',
                  )}
                >
                  <ClientOnly>
                    {() => (
                      <ModelSelector
                        selectedProvider={selectedProvider}
                        selectedModel={selectedModel}
                        onProviderChange={onProviderChange}
                        onModelChange={onModelChange}
                        onSettingsClick={onSettingsClick}
                      />
                    )}
                  </ClientOnly>

                  {chatId && (
                    <ClientOnly>
                      {() => <GitHubBar 
                        chatId={chatId} 
                        projectId={projectId}
                        projectName={projectName}
                      />}
                    </ClientOnly>
                  )}

                  <textarea
                    ref={textareaRef}
                    className={`w-full pl-4 pt-4 pr-16 focus:outline-none resize-none text-md text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent`}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        if (input.trim().length > 0) {
                          sendMessage?.(event);
                        }
                      }
                    }}
                    value={input}
                    onChange={handleInputChange}
                    style={{
                      minHeight: 76,
                      maxHeight: chatStarted ? 400 : 200,
                    }}
                    placeholder="What would you like to build today?"
                    translate="no"
                    aria-label="Enter your prompt"
                  />
                  <ClientOnly>
                    {() => (
                      <SendButton
                        show={true}
                        disabled={input.length === 0 && !isStreaming}
                        isStreaming={isStreaming}
                        onClick={(event) => {
                          if (isStreaming) {
                            handleStop?.();
                            return;
                          }
                          sendMessage?.(event);
                        }}
                      />
                    )}
                  </ClientOnly>
                </div>
              </div>
            </div>
          </div>
          <ClientOnly>{() => <Workbench chatStarted={chatStarted} isStreaming={isStreaming} />}</ClientOnly>
        </div>
      </div>
    );
  },
);

BaseChatEnhanced.displayName = 'BaseChatEnhanced';
