import type { Message } from 'ai';
import React, { type RefCallback, useState, useCallback, useMemo, useEffect, useRef } from 'react';
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

import { ChatModeSelector } from './ChatModeSelector';
import { SlashCommandMenu } from './SlashCommandMenu';
import { CommandPalette, useCommandPalette } from './CommandPalette';
import { parseSlashCommand, isSlashCommand } from '~/lib/utils/slash-commands';
import { type Command, executeCommand, getAllCommands } from '~/lib/stores/commands';
import { useAttachments, type FileAttachment } from '~/lib/hooks/useAttachments';
import { AttachmentsList } from './AttachmentsList';
import { DragDropOverlay } from './DragDropOverlay';
import { FileDropZone, DropHint } from './FileDropZone';
import { ContextFilesPanel, ContextFilesPill } from './ContextFilesPanel';
import { ParameterPanelToggle } from './ParameterPanel';

import { formatFileSize, MAX_FILE_SIZE, MAX_TOTAL_SIZE } from '~/lib/services/attachments';

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
  onProviderChange?: (provider: string) => void;
  onModelChange?: (model: string) => void;
  onSettingsClick?: () => void;
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string, attachments?: FileAttachment[]) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  editIntentPreview?: React.ReactNode;
}

const TEXTAREA_MIN_HEIGHT = 76; // Base minimum height
const TEXTAREA_DEFAULT_HEIGHT = 140; // Default starting height

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
      onProviderChange = () => {},
      onModelChange = () => {},
      onSettingsClick = () => {},
      sendMessage,
      handleInputChange,
      enhancePrompt,
      handleStop,
      editIntentPreview,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    // Internal ref for textarea auto-expand
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const actualTextareaRef = textareaRef || internalTextareaRef;

    // Track textarea height for auto-expand
    const [textareaHeight, setTextareaHeight] = useState(TEXTAREA_DEFAULT_HEIGHT);

    // Slash command state
    const [showSlashMenu, setShowSlashMenu] = useState(false);
    const [slashFilter, setSlashFilter] = useState('');
    const commandPalette = useCommandPalette();

    // Attachments hook for file uploads, drag-drop, and paste
    const {
      attachments,
      fileInputRef,
      isDraggingOver,
      handleAttachmentClick,
      handleFileChange,
      removeAttachment,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handlePaste,
      clearAttachments,
    } = useAttachments();

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

    // Handle sending message with attachments
    const handleSendWithAttachments = useCallback((event: React.UIEvent, messageInput?: string) => {
      sendMessage?.(event, messageInput, attachments.length > 0 ? attachments : undefined);
      clearAttachments();
      // Reset textarea height after sending
      setTextareaHeight(TEXTAREA_DEFAULT_HEIGHT);
    }, [sendMessage, attachments, clearAttachments]);

    /**
     * Auto-expand textarea as content grows
     * Inspired by december's ChatInput component
     */
    const handleTextareaInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Calculate new height, respecting min and max bounds
      const newHeight = Math.max(
        TEXTAREA_MIN_HEIGHT,
        Math.min(textarea.scrollHeight, TEXTAREA_MAX_HEIGHT)
      );
      textarea.style.height = `${newHeight}px`;
      setTextareaHeight(newHeight);
    }, [TEXTAREA_MAX_HEIGHT]);

    // Reset textarea height when input is cleared
    useEffect(() => {
      if (input === '' && actualTextareaRef.current) {
        actualTextareaRef.current.style.height = `${TEXTAREA_DEFAULT_HEIGHT}px`;
        setTextareaHeight(TEXTAREA_DEFAULT_HEIGHT);
      }
    }, [input, actualTextareaRef]);

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
                <FileDropZone
                  className={classNames(
                    'shadow-sm border border-bolt-elements-borderColor bg-bolt-elements-prompt-background backdrop-filter backdrop-blur-[8px] rounded-lg',
                    'transition-all duration-200',
                  )}
                >
                  {/* Hidden file input for attachment button */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.jsx,.tsx,.css,.html"
                    onChange={handleFileChange}
                    className="hidden"
                    aria-hidden="true"
                  />

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
                            <ChatModeSelector compact />
                          </div>
                          <div className="flex items-center gap-2">
                            <ParameterPanelToggle />
                          </div>
                        </div>
                      </div>
                    )}
                  </ClientOnly>



                  {/* Context files panel - show selected context files */}
                  <ClientOnly>
                    {() => <ContextFilesPanel compact />}
                  </ClientOnly>

                  {/* Attachments list - show attached files as pills */}
                  <AttachmentsList attachments={attachments} onRemove={removeAttachment} />

                  {/* Edit intent preview - shows affected files */}
                  {editIntentPreview && (
                    <div className="px-3 py-2 border-b border-bolt-elements-borderColor/50">
                      {editIntentPreview}
                    </div>
                  )}

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

                    {/* Auto-expanding Chat Input Textarea */}
                    <textarea
                      id="chat-input"
                      name="chat-input"
                      ref={actualTextareaRef as React.RefObject<HTMLTextAreaElement>}
                      className={classNames(
                        'w-full pl-4 pt-4 pr-20 pb-4',
                        'focus:outline-none resize-none',
                        'text-lg text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                        'bg-transparent',
                        'transition-[height] duration-100 ease-out',
                      )}
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

                          if (input.trim().length > 0 || attachments.length > 0) {
                            handleSendWithAttachments(event);
                          }
                        }
                      }}
                      onInput={handleTextareaInput}
                      onPaste={handlePaste}
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
                        height: textareaHeight,
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
                        disabled={(input.length === 0 && attachments.length === 0) && !isStreaming}
                        isStreaming={isStreaming}
                        onClick={(event) => {
                          if (isStreaming) {
                            handleStop?.();
                            return;
                          }

                          handleSendWithAttachments(event);
                        }}
                      />
                    )}
                  </ClientOnly>
                  </div>
                  <div className="flex justify-between text-sm p-4 pt-2">
                    <div className="flex gap-2 items-center">
                      {/* Attachment button */}
                      <IconButton
                        title="Attach files (images, documents)"
                        onClick={handleAttachmentClick}
                        className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                      >
                        <div className="i-ph:paperclip text-xl" />
                        {attachments.length > 0 ? (
                          <span className="ml-1 text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded-full">
                            {attachments.length}
                          </span>
                        ) : <></>}
                      </IconButton>
                      {/* REMOVED: UI declutter — Enhance prompt button removed. Use /enhance slash command instead. */}
                    </div>
                    <div className="flex items-center gap-4">
                      {input.length > 3 ? (
                        <div className="text-xs text-bolt-elements-textTertiary">
                          Use <kbd className="kdb">Shift</kbd> + <kbd className="kdb">Return</kbd> for a new line
                        </div>
                      ) : null}
                    </div>
                  </div>
                </FileDropZone>
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
