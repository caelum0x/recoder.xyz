import { useStore } from '@nanostores/react';
import { useAnimate } from 'framer-motion';
import { memo, useEffect, useRef, useState } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { useLoaderData } from '@remix-run/react';
import { useMessageParser, usePromptEnhancer, useShortcuts, useSnapScroll } from '~/lib/hooks';
import { useSimpleChat, type Message } from '~/lib/hooks/useSimpleChat';
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from '~/lib/hooks/useKeyboardShortcuts';
import { useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { getToolsForAI, initCustomTools } from '~/lib/stores/custom-tools';
import { fileModificationsToHTML } from '~/utils/diff';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { showSmartError } from '~/lib/errors/toast-error';
import { BaseChat } from './BaseChat';
import { QuickActions } from './QuickActions';
import { KeyboardShortcutsDialog } from '~/components/ui/KeyboardShortcutsDialog';
import { SaveIndicator } from './SaveIndicator';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('Chat');

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory } = useChatHistory();
  const { id: chatId, projectId, projectName } = useLoaderData<{ id?: string; projectId?: string; projectName?: string }>();

  return (
    <>
      {ready && <ChatImpl key={chatId || 'new'} chatId={chatId} projectId={projectId} projectName={projectName} initialMessages={initialMessages} storeMessageHistory={storeMessageHistory} />}
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          /**
           * @todo Handle more types if we need them. This may require extra color palettes.
           */
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
      />
    </>
  );
}

interface ChatProps {
  chatId?: string;
  projectId?: string;
  projectName?: string;
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
}

export const ChatImpl = memo(({ chatId, projectId, projectName, initialMessages, storeMessageHistory }: ChatProps) => {
  useShortcuts();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | undefined>();

  // Lightning Mode and Task Categories
  const [lightningMode, setLightningMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lightningMode') === 'true';
    }
    return false;
  });
  const [taskCategory, setTaskCategory] = useState<'code' | 'debug' | 'refactor' | 'explain' | 'test' | 'deploy' | 'general'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('taskCategory') as any) || 'general';
    }
    return 'general';
  });

  // Provider and Model Selection
  const [selectedProvider, setSelectedProvider] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selectedProvider') || 'openrouter';
    }
    return 'openrouter';
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selectedModel') || 'x-ai/grok-code-fast-1';
    }
    return 'x-ai/grok-code-fast-1';
  });

  // Save preferences to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedProvider', selectedProvider);
      localStorage.setItem('selectedModel', selectedModel);
      localStorage.setItem('lightningMode', String(lightningMode));
      localStorage.setItem('taskCategory', taskCategory);
    }
  }, [selectedProvider, selectedModel, lightningMode, taskCategory]);

  // Auto-switch model when Lightning Mode changes
  useEffect(() => {
    if (lightningMode) {
      // Switch to fast models
      const fastModels: Record<string, string> = {
        'openrouter': 'google/gemini-2.0-flash-exp:free',
        'anthropic': 'anthropic/claude-3-haiku',
        'openai': 'openai/gpt-4o-mini',
        'google': 'google/gemini-2.0-flash-exp:free',
        'groq': 'groq/llama-3.3-70b-versatile',
      };
      const fastModel = fastModels[selectedProvider] || fastModels['openrouter'];
      setSelectedModel(fastModel);
    } else {
      // Switch back to standard models
      const standardModels: Record<string, string> = {
        'openrouter': 'anthropic/claude-3.5-sonnet',
        'anthropic': 'anthropic/claude-3.5-sonnet',
        'openai': 'openai/gpt-4o',
        'google': 'google/gemini-2.0-flash-thinking-exp:free',
        'groq': 'groq/llama-3.3-70b-versatile',
      };
      const standardModel = standardModels[selectedProvider] || standardModels['openrouter'];
      setSelectedModel(standardModel);
    }
  }, [lightningMode, selectedProvider]);

  const { showChat } = useStore(chatStore);

  const [animationScope, animate] = useAnimate();

  // Set project ID for Docker backend and initialize project state
  useEffect(() => {
    if (chatId) {
      workbenchStore.setProjectId(chatId);
      
      // Initialize project state for context tracking
      import('~/lib/stores/project-state').then(({ initProject }) => {
        initProject({ projectId: chatId });
      });
    }
  }, [chatId]);

  // Get project context for AI
  const [projectContext, setProjectContext] = useState<string>('');
  const [customTools, setCustomTools] = useState<string>('');
  const [mcpTools, setMcpTools] = useState<string>('');
  
  useEffect(() => {
    // Initialize custom tools
    initCustomTools();
    setCustomTools(getToolsForAI());
  }, []);
  
  useEffect(() => {
    // Update project context periodically
    const updateContext = () => {
      import('~/lib/stores/project-state').then(({ getContextSummary }) => {
        setProjectContext(getContextSummary());
      }).catch(() => {});
      // Update custom tools
      setCustomTools(getToolsForAI());
      // Update MCP tools
      import('~/lib/mcp/client').then(({ mcpClient }) => {
        setMcpTools(mcpClient.getToolsPrompt());
      }).catch(() => {});
    };
    
    updateContext();
    const interval = setInterval(updateContext, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const { messages, isLoading, input, handleInputChange, setInput, stop, append } = useSimpleChat({
    api: '/api/chat',
    body: {
      provider: selectedProvider,
      model: selectedModel,
      lightningMode,
      taskCategory,
      projectContext, // Pass project context to server
      customTools, // Pass custom tools to server
      mcpTools, // Pass MCP tools to server
    },
    onError: (error) => {
      logger.error('Request failed\n\n', error);
      console.error('❌ Chat API error:', error);
      // Use smart error handler instead of generic toast
      showSmartError(error, {
        onAction: (action) => {
          console.log('Error action:', action);
          // Handle action execution here if needed
        }
      });
    },
    onFinish: () => {
      logger.debug('Finished streaming');
      console.log('✅ Streaming finished');
    },
    onResponse: (response) => {
      console.log('📥 Response received:', response.status, response.statusText);
    },
    initialMessages,
  });

  const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
  const { parsedMessages, parseMessages } = useMessageParser();

  const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

  // Setup keyboard shortcuts
  useKeyboardShortcuts([
    {
      ...COMMON_SHORTCUTS.SEND_MESSAGE,
      action: () => {
        if (input.trim() && !isLoading) {
          const event = new Event('submit') as any;
          sendMessage(event);
        }
      },
    },
    {
      ...COMMON_SHORTCUTS.SEND_MESSAGE_CTRL,
      action: () => {
        if (input.trim() && !isLoading) {
          const event = new Event('submit') as any;
          sendMessage(event);
        }
      },
    },
    {
      ...COMMON_SHORTCUTS.QUICK_ACTIONS,
      action: () => setShowQuickActions(!showQuickActions),
    },
    {
      ...COMMON_SHORTCUTS.QUICK_ACTIONS_CTRL,
      action: () => setShowQuickActions(!showQuickActions),
    },
    {
      ...COMMON_SHORTCUTS.CLEAR_CHAT,
      action: () => {
        if (confirm('Clear chat history?')) {
          window.location.href = '/';
        }
      },
    },
    {
      ...COMMON_SHORTCUTS.CLEAR_CHAT_CTRL,
      action: () => {
        if (confirm('Clear chat history?')) {
          window.location.href = '/';
        }
      },
    },
    {
      ...COMMON_SHORTCUTS.SHOW_SHORTCUTS,
      action: () => setShowShortcutsDialog(true),
    },
    {
      ...COMMON_SHORTCUTS.SHOW_SHORTCUTS_CTRL,
      action: () => setShowShortcutsDialog(true),
    },
    {
      ...COMMON_SHORTCUTS.CANCEL,
      action: () => {
        if (isLoading) {
          abort();
        } else if (showQuickActions) {
          setShowQuickActions(false);
        } else if (showShortcutsDialog) {
          setShowShortcutsDialog(false);
        }
      },
    },
    {
      ...COMMON_SHORTCUTS.FOCUS_INPUT,
      action: () => textareaRef.current?.focus(),
    },
    {
      ...COMMON_SHORTCUTS.FOCUS_INPUT_CTRL,
      action: () => textareaRef.current?.focus(),
    },
  ]);

  // Update chat started state when initialMessages change (important for loading old chats)
  useEffect(() => {
    const hasMessages = initialMessages.length > 0;
    chatStore.setKey('started', hasMessages);
    setChatStarted(hasMessages);
    console.log('🔄 [ChatImpl] Chat started state updated:', hasMessages, 'messages:', initialMessages.length);
  }, [initialMessages]);

  // Store the previous isLoading state to detect when streaming completes
  const prevIsLoading = useRef(isLoading);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    parseMessages(messages, isLoading);

    // Save chat history whenever messages change
    // Use debouncing during streaming to avoid excessive saves
    if (messages.length > 0) {
      // Clear any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const streamingJustFinished = prevIsLoading.current && !isLoading;
      prevIsLoading.current = isLoading;

      // FIX: Add delay after streaming finishes to allow ActionRunner to write files
      // Save after 3 seconds when streaming finishes (to allow file writes), or after 5 seconds during streaming
      const saveDelay = streamingJustFinished ? 3000 : (!isLoading ? 3000 : 5000);

      saveTimeoutRef.current = setTimeout(() => {
        console.log('💾 Saving chat history (after allowing time for file writes):', {
          messageCount: messages.length,
          isStreaming: isLoading,
          streamingJustFinished,
          delayUsed: saveDelay,
        });

        setIsSaving(true);
        storeMessageHistory(messages)
          .then(() => {
            setIsSaving(false);
            setLastSaved(new Date());
            console.log('✅ Chat history saved successfully');
          })
          .catch((error) => {
            setIsSaving(false);
            console.error('❌ Failed to save chat history:', error);
            // Use smart error handler for storage errors
            showSmartError(error, {
              onAction: (action) => {
                if (action.type === 'command' && action.action === 'retry') {
                  storeMessageHistory(messages);
                }
              }
            });
          });
      }, saveDelay);
    }

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [messages, isLoading, parseMessages, storeMessageHistory]);

  const scrollTextArea = () => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  };

  const abort = () => {
    stop();
    chatStore.setKey('aborted', true);
    workbenchStore.abortAllActions();
  };

  useEffect(() => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.style.height = 'auto';

      const scrollHeight = textarea.scrollHeight;

      textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
      textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
    }
  }, [input, textareaRef]);

  const runAnimation = async () => {
    if (chatStarted) {
      return;
    }

    await Promise.all([
      animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
      animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
    ]);

    chatStore.setKey('started', true);

    setChatStarted(true);
  };

  const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
    const _input = messageInput || input;

    console.log('📤 Sending message:', _input.substring(0, 100));

    if (_input.length === 0 || isLoading) {
      console.warn('⚠️ Message not sent - empty input or already loading');
      return;
    }

    /**
     * @note (delm) Usually saving files shouldn't take long but it may take longer if there
     * many unsaved files. In that case we need to block user input and show an indicator
     * of some kind so the user is aware that something is happening. But I consider the
     * happy case to be no unsaved files and I would expect users to save their changes
     * before they send another message.
     */
    await workbenchStore.saveAllFiles();

    const fileModifications = workbenchStore.getFileModifcations();

    chatStore.setKey('aborted', false);

    runAnimation();

    if (fileModifications !== undefined) {
      const diff = fileModificationsToHTML(fileModifications);

      /**
       * If we have file modifications we append a new user message manually since we have to prefix
       * the user input with the file modifications and we don't want the new user input to appear
       * in the prompt. Using `append` is almost the same as `handleSubmit` except that we have to
       * manually reset the input and we'd have to manually pass in file attachments. However, those
       * aren't relevant here.
       */
      console.log('📤 Sending with file modifications');
      append({ role: 'user', content: `${diff}\n\n${_input}` });

      /**
       * After sending a new message we reset all modifications since the model
       * should now be aware of all the changes.
       */
      workbenchStore.resetAllFileModifications();
    } else {
      console.log('📤 Sending without file modifications');
      append({ role: 'user', content: _input });
    }

    setInput('');

    resetEnhancer();

    textareaRef.current?.blur();
  };

  // Listen for import events from GitHub/Starters/Templates
  useEffect(() => {
    const handleImport = async (event: CustomEvent) => {
      const { prompt, files, repository, template, isLocal } = event.detail;

      console.log('🎯 Received bolt:import event:', {
        isLocal: isLocal || false,
        hasPrompt: !!prompt,
        prompt: prompt ? prompt.substring(0, 100) : 'No prompt (local starter)',
        fileCount: Object.keys(files).length,
        repository: repository.name,
        template: template?.name
      });

      // DIRECTLY create files in workbench using actions
      console.log('📝 Creating files directly in workbench...');

      const fileEntries = Object.entries(files);
      let createdCount = 0;

      // Create a special artifact for imports
      const messageId = `import_${Date.now()}`;
      const artifactId = `artifact_${messageId}`;

      // Open the artifact first
      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact({
        messageId,  // This is the key for the artifacts map
        id: artifactId,
        title: repository.name || 'Imported Files',
      });

      // Create files in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < fileEntries.length; i += batchSize) {
        const batch = fileEntries.slice(i, i + batchSize);

        // Process batch in parallel
        await Promise.all(batch.map(async ([filePath, content]) => {
          try {
            // Create action for each file
            const actionId = `${artifactId}_action_${createdCount}`;

            const actionData = {
              artifactId,
              messageId,
              actionId,
              action: {
                type: 'file' as const,
                filePath: filePath.startsWith('/') ? filePath.slice(1) : filePath, // Remove leading slash
                content: content as string,
              }
            };

            // Add and run the action directly
            workbenchStore.addAction(actionData);
            await workbenchStore.runAction(actionData);

            createdCount++;
          } catch (error) {
            console.error(`   ❌ Failed to create file ${filePath}:`, error);
          }
        }));

        // Log progress after each batch
        console.log(`   ✅ Created ${createdCount}/${fileEntries.length} files (${Math.round((createdCount/fileEntries.length) * 100)}%)`);

        // Small delay between batches to avoid overwhelming system
        if (i + batchSize < fileEntries.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      console.log(`✅ Import complete: ${createdCount}/${fileEntries.length} files created`);

      // After files are created, optionally send AI message about the import
      if (prompt && !isLoading) {
        setTimeout(() => {
          console.log('✨ Notifying AI about imported files');
          sendMessage({} as React.UIEvent, prompt);
        }, 500);
      }
    };

    window.addEventListener('bolt:import', handleImport as any);

    return () => {
      window.removeEventListener('bolt:import', handleImport as any);
    };
  }, [isLoading, sendMessage]);

  const [messageRef, scrollRef] = useSnapScroll();

  return (
    <>
      <BaseChat
        ref={animationScope}
        chatId={chatId}
        projectId={projectId}
        projectName={projectName}
        textareaRef={textareaRef}
        input={input}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={isLoading}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
        lightningMode={lightningMode}
        taskCategory={taskCategory}
        onProviderChange={setSelectedProvider}
        onModelChange={setSelectedModel}
        onLightningModeChange={setLightningMode}
        onTaskCategoryChange={setTaskCategory}
        onSettingsClick={() => {
          // Navigate to API key management page
          if (typeof window !== 'undefined') {
            const mainAppUrl = window.location.hostname.includes('localhost')
              ? 'http://localhost:3000'
              : 'https://recoder.xyz';
            window.open(`${mainAppUrl}/settings/ai-providers`, '_blank');
          }
        }}
        sendMessage={sendMessage}
        messageRef={messageRef}
        scrollRef={scrollRef}
        handleInputChange={handleInputChange}
        handleStop={abort}
        messages={messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          return {
            ...message,
            content: parsedMessages[i] || '',
          };
        })}
        enhancePrompt={() => {
          enhancePrompt(input, (input) => {
            setInput(input);
            scrollTextArea();
          });
        }}
      />

      {/* Quick Actions Floating Button */}
      {chatStarted && (
        <QuickActions
          onSelectAction={(prompt) => {
            setInput(prompt);
            textareaRef.current?.focus();
            // Auto-send the quick action prompt
            setTimeout(() => {
              const event = new Event('submit') as any;
              sendMessage(event, prompt);
            }, 100);
          }}
          disabled={isLoading}
        />
      )}

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        open={showShortcutsDialog}
        onClose={() => setShowShortcutsDialog(false)}
      />

      {/* Save Indicator */}
      <SaveIndicator isSaving={isSaving} lastSaved={lastSaved} />
    </>
  );
});
