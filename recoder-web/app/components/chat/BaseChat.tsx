import type { Message } from 'ai';
import React, { type RefCallback, useState, useCallback, useMemo } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { IconButton } from '~/components/ui/IconButton';
import { Workbench } from '~/components/workbench/Workbench.client';
import { classNames } from '~/utils/classNames';
import { Messages } from './Messages.client';
import { SendButton } from './SendButton.client';
import { ExamplePrompts } from './ExamplePrompts';
import { ModelSelector } from './ModelSelector';
// MCP button removed - MCP tools are connected server-side
import { ProjectGallery } from '~/components/gallery/ProjectGallery';
import type { TemplateRepo } from '~/lib/.server/github/types';

import { TokenControl } from './TokenControl';
import { ModeSelector } from './ModeSelector';
import { SlashCommandMenu } from './SlashCommandMenu';
import { CommandPalette, useCommandPalette } from './CommandPalette';
import { parseSlashCommand, isSlashCommand } from '~/lib/utils/slash-commands';
import { type Command, executeCommand, getAllCommands } from '~/lib/stores/commands';

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
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  selectedProvider?: string;
  selectedModel?: string;
  maxTokens?: number;
  onProviderChange?: (provider: string) => void;
  onModelChange?: (model: string) => void;
  onMaxTokensChange?: (tokens: number) => void;
  onSettingsClick?: () => void;
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
}

const TEXTAREA_MIN_HEIGHT = 140; // Increased from 76 to 140 for larger input area

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      chatId,
      projectId,
      projectName,
      textareaRef,
      scrollRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      enhancingPrompt = false,
      promptEnhanced = false,
      messages,
      input = '',
      selectedProvider = 'openrouter',
      selectedModel = 'x-ai/grok-code-fast-1',
      maxTokens = 4000,
      onProviderChange = () => {},
      onModelChange = () => {},
      onMaxTokensChange = () => {},
      onSettingsClick = () => {},
      sendMessage,
      handleInputChange,
      enhancePrompt,
      handleStop,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    // Slash command state
    const [showSlashMenu, setShowSlashMenu] = useState(false);
    const [slashFilter, setSlashFilter] = useState('');
    const commandPalette = useCommandPalette();

    // Get filtered commands for slash menu
    const slashCommands = useMemo(() => {
      if (!showSlashMenu) return [];
      const parsed = parseSlashCommand(input);
      return parsed?.suggestions || getAllCommands();
    }, [showSlashMenu, input]);

    // Handle command selection from slash menu or palette
    const handleCommandSelect = useCallback(async (command: Command) => {
      setShowSlashMenu(false);

      if (command.action === 'prompt' && command.prompt) {
        // Send prompt to AI
        sendMessage?.({} as React.UIEvent, command.prompt);
      } else if (command.action === 'shell') {
        // Execute shell command and show result
        const result = await executeCommand(command.id, projectId || 'default');
        if (result.output) {
          // Show command output as a message
          sendMessage?.({} as React.UIEvent, `Running \`/${command.id}\`...\n\nOutput:\n\`\`\`\n${result.output}\n\`\`\``);
        }
      }
    }, [sendMessage, projectId]);

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
        <div ref={scrollRef} className="flex overflow-y-auto w-full h-full">
          <div className={classNames(styles.Chat, 'flex flex-col flex-grow min-w-[var(--chat-min-width)] h-full')}>
            {!chatStarted && (
              <div id="intro" className="mt-[26vh] max-w-chat mx-auto">
                {projectName ? (
                  <>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <span className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-sm font-medium">
                        <span className="i-ph:folder mr-1" /> {projectName}
                      </span>
                    </div>
                    <h1 className="text-5xl text-center font-bold text-bolt-elements-textPrimary mb-2">
                      Continue building
                    </h1>
                    <p className="mb-4 text-center text-bolt-elements-textSecondary">
                      What would you like to add to this project?
                    </p>
                  </>
                ) : (
                  <>
                    <h1 className="text-5xl text-center font-bold text-bolt-elements-textPrimary mb-2">
                      Where ideas begin
                    </h1>
                    <p className="mb-4 text-center text-bolt-elements-textSecondary">
                      Bring ideas to life in seconds or get help on existing projects.
                    </p>
                  </>
                )}
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
                    <Messages
                      className="flex flex-col w-full flex-1 max-w-chat px-4 pb-6 mx-auto z-1"
                      messages={messages}
                      isStreaming={isStreaming}
                    />
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
                    'shadow-sm border border-bolt-elements-borderColor bg-bolt-elements-prompt-background backdrop-filter backdrop-blur-[8px] rounded-lg',
                  )}
                >
                  {/* Model and Mode Selection - Above textarea */}
                  <ClientOnly>
                    {() => (
                      <div className="p-3 border-b border-bolt-elements-borderColor">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <ModelSelector
                              selectedProvider={selectedProvider}
                              selectedModel={selectedModel}
                              onProviderChange={onProviderChange}
                              onModelChange={onModelChange}
                              onSettingsClick={onSettingsClick}
                            />
                            <ModeSelector compact />
                          </div>
                          <TokenControl value={maxTokens} onChange={onMaxTokensChange} />
                        </div>
                      </div>
                    )}
                  </ClientOnly>



                  <div className="relative">
                    {/* Slash Command Menu */}
                    {showSlashMenu && slashCommands.length > 0 && (
                      <SlashCommandMenu
                        commands={slashCommands}
                        onSelect={handleCommandSelect}
                        onClose={() => setShowSlashMenu(false)}
                        position="above"
                      />
                    )}

                    {/* Larger Chat Input Textarea - Wider */}
                    <textarea
                      id="chat-input"
                      name="chat-input"
                      ref={textareaRef}
                      className={`w-full pl-4 pt-4 pr-20 pb-4 focus:outline-none resize-none text-lg text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent`}
                    onKeyDown={(event) => {
                      // Handle slash command selection
                      if (showSlashMenu) {
                        if (event.key === 'Tab' || event.key === 'Enter') {
                          event.preventDefault();
                          if (slashCommands.length > 0) {
                            handleCommandSelect(slashCommands[0]);
                          }
                          return;
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setShowSlashMenu(false);
                          return;
                        }
                      }

                      if (event.key === 'Enter') {
                        if (event.shiftKey) {
                          return;
                        }

                        event.preventDefault();

                        // Check if it's a slash command
                        if (isSlashCommand(input)) {
                          const parsed = parseSlashCommand(input);
                          if (parsed && !parsed.isPartial && parsed.suggestions.length > 0) {
                            handleCommandSelect(parsed.suggestions[0]);
                            return;
                          }
                        }

                        if (input.trim().length > 0) {
                          sendMessage?.(event);
                        }
                      }
                    }}
                    value={input}
                    onChange={(event) => {
                      handleInputChange?.(event);

                      // Show/hide slash command menu
                      const value = event.target.value;
                      if (value.trimStart().startsWith('/')) {
                        setShowSlashMenu(true);
                        setSlashFilter(value.trimStart().slice(1));
                      } else {
                        setShowSlashMenu(false);
                        setSlashFilter('');
                      }
                    }}
                    style={{
                      minHeight: TEXTAREA_MIN_HEIGHT,
                      maxHeight: TEXTAREA_MAX_HEIGHT,
                    }}
                    placeholder="What would you like to build today? Type / for commands"
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
                  <div className="flex justify-between text-sm p-4 pt-2">
                    <div className="flex gap-2 items-center">
                      <IconButton
                        title="Enhance prompt"
                        disabled={input.length === 0 || enhancingPrompt}
                        className={classNames({
                          'opacity-100!': enhancingPrompt,
                          'text-bolt-elements-item-contentAccent! pr-1.5 enabled:hover:bg-bolt-elements-item-backgroundAccent!':
                            promptEnhanced,
                        })}
                        onClick={() => enhancePrompt?.()}
                      >
                        {enhancingPrompt ? (
                          <>
                            <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl"></div>
                            <div className="ml-1.5">Enhancing prompt...</div>
                          </>
                        ) : (
                          <>
                            <div className="i-bolt:stars text-xl"></div>
                            {promptEnhanced && <div className="ml-1.5">Prompt enhanced</div>}
                          </>
                        )}
                      </IconButton>
                    </div>
                    {input.length > 3 ? (
                      <div className="text-xs text-bolt-elements-textTertiary">
                        Use <kbd className="kdb">Shift</kbd> + <kbd className="kdb">Return</kbd> for a new line
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            {!chatStarted && (
              <div id="examples" className="w-full px-6 pb-8">
                {/* Example Prompts - New comprehensive version */}
                <div className="mb-8">
                  <ClientOnly>
                    {() => (
                      <ExamplePrompts
                        onSelectPrompt={(prompt) => {
                          sendMessage?.({} as React.UIEvent, prompt);
                        }}
                      />
                    )}
                  </ClientOnly>
                </div>

                {/* Community Projects Gallery */}
                <div className="mt-8">
                  <ClientOnly>
                    {() => <ProjectGallery />}
                  </ClientOnly>
                </div>
              </div>
            )}
          </div>
          <ClientOnly>{() => <Workbench chatStarted={chatStarted} isStreaming={isStreaming} />}</ClientOnly>
        </div>

        {/* Command Palette - Ctrl+Shift+P */}
        <ClientOnly>
          {() => (
            <CommandPalette
              isOpen={commandPalette.isOpen}
              onClose={commandPalette.close}
              onSelect={handleCommandSelect}
            />
          )}
        </ClientOnly>
      </div>
    );
  },
);
