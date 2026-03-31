import { useStore } from '@nanostores/react';
import { useAnimate } from 'framer-motion';
import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { useLoaderData } from '@remix-run/react';
import { useMessageParser, usePromptEnhancer, useShortcuts, useSnapScroll, useContextPaths } from '~/lib/hooks';
import { useSimpleChat, type Message } from '~/lib/hooks/useSimpleChat';
import { useAgentSession } from '~/lib/hooks/useAgentSession';
import { useChatDraft } from '~/lib/hooks/useChatDraft';
import { trackAITokenUsage, initializeUsageTracking } from '~/lib/services/billing/usage-billing';
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from '~/lib/hooks/useKeyboardShortcuts';
import { useCommandPalette } from '~/lib/hooks/useCommandPalette';
import { useEditIntent, getIntentSummary, intentRequiresCodeChanges } from '~/lib/hooks/useEditIntent';
import { useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { getToolsForAI, initCustomTools } from '~/lib/stores/custom-tools';
import { currentMode } from '~/lib/stores/mode';
import { currentChatMode, type ChatMode } from '~/lib/stores/chat-mode';
import { autoSelectProfileForMode, selectErrorFixProfile, activeProfileModelStore } from '~/lib/stores/model-profiles';
import { startHealthCheckPolling, stopHealthCheckPolling } from '~/lib/stores/connection';
import { inferenceParamsStore } from '~/lib/stores/inference-params';
import { preferencesStore } from '~/lib/stores/settings';
import { fileModificationsToHTML } from '~/utils/diff';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { showSmartError } from '~/lib/errors/toast-error';
import { projectContextCache } from '~/lib/services/project-context-cache';
import { resolveSandboxProjectId } from '~/lib/services/sandbox-project-id';
import { BaseChat } from './BaseChat';
import { CloneUrlModal } from './CloneUrlModal';
import { commandPaletteOpen } from '~/lib/stores/command-palette';

// Lazy-loaded modal/dialog components -- only fetched when their toggle flag is true
const GitHubImporter = lazy(() =>
  import('~/components/github/GitHubImporter').then((m) => ({ default: m.GitHubImporter })),
);
const DeploymentModal = lazy(() =>
  import('~/components/deployment/DeploymentModal').then((m) => ({ default: m.DeploymentModal })),
);
const KeyboardShortcutsDialog = lazy(() =>
  import('~/components/ui/KeyboardShortcutsDialog').then((m) => ({ default: m.KeyboardShortcutsDialog })),
);
const CommandPalette = lazy(() =>
  import('~/components/ui/CommandPalette').then((m) => ({ default: m.CommandPalette })),
);
import { SaveIndicator } from './SaveIndicator';
import { EditIntentPreview } from './EditIntentPreview';
import type { FileAttachment } from '~/lib/hooks/useAttachments';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('ChatClient');

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory } = useChatHistory();
  const { id: chatId, projectId, projectName, projectFramework, projectTemplateId } = useLoaderData<{
    id?: string;
    projectId?: string;
    projectName?: string;
    projectFramework?: string;
    projectTemplateId?: string;
  }>();

  return (
    <>
      {ready && <ChatImpl key={chatId || 'new'} chatId={chatId} projectId={projectId} projectName={projectName} projectFramework={projectFramework} projectTemplateId={projectTemplateId} initialMessages={initialMessages} storeMessageHistory={storeMessageHistory} />}
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
              return <div className="i-ph:check-bold text-recoder-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-recoder-elements-icon-error text-2xl" />;
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
  projectFramework?: string;
  projectTemplateId?: string;
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
}

export const ChatImpl = memo(({ chatId, projectId, projectName, projectFramework, projectTemplateId, initialMessages, storeMessageHistory }: ChatProps) => {
  useShortcuts();

  // Initialize usage tracking on mount
  useEffect(() => {
    initializeUsageTracking();
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | undefined>();

  // Initialize command palette with callbacks
  useCommandPalette({
    onClearChat: () => {
      if (confirm('Clear chat history?')) {
        window.location.href = '/';
      }
    },
    onOpenSettings: () => {
      if (typeof window !== 'undefined') {
        const mainAppUrl = window.location.hostname.includes('localhost')
          ? 'http://localhost:3000'
          : 'https://recoder.xyz';
        window.open(`${mainAppUrl}/settings/ai-providers`, '_blank');
      }
    },
    onDeploy: () => setShowDeployModal(true),
    onImportGitHub: () => setShowGitHubModal(true),
  });

  // AI Mode (architect, code, ask, debug, orchestrator)
  const mode = useStore(currentMode);

  // Chat Mode (build, ask, agent)
  const chatMode = useStore(currentChatMode);

  // Agent session (for agent mode)
  const { startAgent, isActive: isAgentActive } = useAgentSession();

  // Auto-select model profile when chat mode changes
  const prevChatModeRef = useRef<ChatMode>(chatMode);
  useEffect(() => {
    if (chatMode !== prevChatModeRef.current) {
      prevChatModeRef.current = chatMode;
      autoSelectProfileForMode(chatMode);
    }
  }, [chatMode]);

  // Sync model selection from profile store
  const profileModel = useStore(activeProfileModelStore);

  // Max tokens is managed by inference params store directly

  // Provider and Model Selection
  const [selectedProvider, setSelectedProvider] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selectedProvider') || 'openrouter';
    }
    return 'openrouter';
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('selectedModel') || 'openai/gpt-4o-mini';
    }
    return 'openai/gpt-4o-mini';
  });

  // When the active profile's model changes, sync to component state.
  // Use a ref for selectedModel to avoid stale closure and prevent
  // this effect from fighting with manual ModelSelector changes.
  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;
  useEffect(() => {
    if (profileModel && profileModel !== selectedModelRef.current) {
      setSelectedModel(profileModel);
      setSelectedProvider('openrouter');
    }
  }, [profileModel]);

  // Save preferences to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedProvider', selectedProvider);
      localStorage.setItem('selectedModel', selectedModel);
    }
  }, [selectedProvider, selectedModel]);

  const { showChat } = useStore(chatStore);
  const isCommandPaletteOpen = useStore(commandPaletteOpen);

  const [animationScope, animate] = useAnimate();

  // Generate a stable sandbox project ID. Route slugs like "hello-world"
  // are chat identifiers, not valid Docker project ids.
  const [projectIdForDocker] = useState(() => resolveSandboxProjectId({
    preferredProjectId: projectId,
    chatId,
  }));

  // Set project ID for Docker backend and initialize project state
  // Pass framework/templateId so the backend can configure the container appropriately
  // (e.g., Expo projects need different dev server setup)
  useEffect(() => {
    // Build container creation options from project metadata
    const containerOptions: { framework?: string; templateId?: string } = {};
    if (projectFramework) {
      containerOptions.framework = projectFramework;
    }
    if (projectTemplateId) {
      containerOptions.templateId = projectTemplateId;
    }

    // Always set project ID (use chatId if available, otherwise generated ID)
    workbenchStore.setProjectId(
      projectIdForDocker,
      Object.keys(containerOptions).length > 0 ? containerOptions : undefined
    ).catch(() => {});

    // Initialize project state for context tracking
    import('~/lib/stores/project-state').then(({ initProject }) => {
      initProject({ projectId: projectIdForDocker });
    });

    // Initialize project context cache (subscribes to file-change events)
    projectContextCache.init();

    // Start connection health monitoring
    startHealthCheckPolling(30000); // Check every 30 seconds

    return () => {
      stopHealthCheckPolling();
      projectContextCache.destroy();
    };
  }, [projectIdForDocker, projectFramework, projectTemplateId]);

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

  // 🔧 FIX: Track pending save to ensure AI responses are captured
  const pendingSaveRef = useRef<NodeJS.Timeout | null>(null);
  // 🔧 FIX: Use ref to track latest messages for the onFinish callback
  const messagesRef = useRef<Message[]>([]);
  // 🔧 FIX: Track if onFinish already triggered a save to prevent double saves
  const onFinishSavedRef = useRef<boolean>(false);

  // Code context for AI awareness
  const [codeContext, setCodeContext] = useState<string>('');

  // Edit intent analyzer - analyzes user input to predict affected files
  const {
    intent: editIntent,
    isAnalyzing: isAnalyzingIntent,
    preview: editPreview,
    focusedContext,
    error: intentError,
    analyzePromptDebounced,
    clearAnalysis,
    isReady: isIntentReady,
  } = useEditIntent({
    projectId: projectIdForDocker,
    debounceMs: 400,
    minPromptLength: 10,
    maxContextTokens: 4000,
    enabled: chatStarted, // Only enable after chat has started
  });

  // Load code context when project changes or before sending messages
  // Now uses focused context from edit intent analyzer when available
  // Uses ProjectContextCache to avoid redundant Docker API calls
  const loadCodeContext = async (userMessage: string) => {
    try {
      // Priority 1: focused context from edit intent (already cached via shared cache)
      if (focusedContext && editIntent && intentRequiresCodeChanges(editIntent)) {
        logger.debug('Using focused context from edit intent analyzer');
        setCodeContext(focusedContext);
        return focusedContext;
      }

      // Priority 2: cached project context — only fetches if files changed
      const context = await projectContextCache.getContext(projectIdForDocker);
      if (context) {
        const { generateContextPrompt } = await import('~/lib/services/code-context');
        const xml = generateContextPrompt(context, userMessage, 4000);
        setCodeContext(xml);
        return xml;
      }
    } catch (error) {
      logger.warn('Failed to load code context:', error);
    }
    return '';
  };

  // Get inference parameters from store
  const inferenceParams = useStore(inferenceParamsStore);
  const preferences = useStore(preferencesStore);

  // Ref for clearDraft (set after useChatDraft, used by onFinish callback)
  const clearDraftRef = useRef<(() => void) | null>(null);

  const { messages, isLoading, input, handleInputChange, setInput, stop, append } = useSimpleChat({
    api: '/api/chat',
    body: {
      provider: selectedProvider,
      model: selectedModel,
      maxTokens: inferenceParams.maxTokens,
      temperature: inferenceParams.temperature,
      topP: inferenceParams.topP,
      topK: inferenceParams.topK,
      frequencyPenalty: inferenceParams.frequencyPenalty,
      presencePenalty: inferenceParams.presencePenalty,
      thinkingBudget: preferences.ai.thinkingBudget, // Thinking budget (low/medium/high)
      mode, // AI mode (architect, code, ask, debug, orchestrator)
      chatMode, // Chat mode (build, ask, agent)
      projectContext, // Pass project context to server
      customTools, // Pass custom tools to server
      mcpTools, // Pass MCP tools to server
      projectId: projectIdForDocker, // Project ID for context loading
      codeContext, // Pre-loaded code context
    },
    onError: (error) => {
      logger.error('Request failed\n\n', error);
      logger.error('❌ Chat API error:', error);
      // Use smart error handler instead of generic toast
      showSmartError(error, {
        onAction: (action) => {
          // console.log('Error action:', action);
          // Handle action execution here if needed
        }
      });
    },
    onFinish: (assistantMessage) => {
      logger.debug('Finished streaming');
      // Clear draft on successful AI response
      clearDraftRef.current?.();

      // Track AI token usage for billing
      const estimatedTokens = (assistantMessage.content?.length || 0) / 4;
      if (estimatedTokens > 0) {
        trackAITokenUsage(Math.ceil(estimatedTokens));
      }

      // Create AI snapshot after AI changes complete
      workbenchStore.createAISnapshotForAll('AI response completed').catch((err) => {
        logger.warn('Failed to create AI snapshot:', err);
      });

      // 🔧 FIX: Immediately trigger save after AI response completes
      // Use messagesRef to get the latest messages including the completed assistant message
      if (pendingSaveRef.current) {
        clearTimeout(pendingSaveRef.current);
      }
      // 🔧 FIX: Mark that onFinish is handling the save to prevent double saves from useEffect
      onFinishSavedRef.current = true;
      // Small delay to let React state settle, but save quickly
      pendingSaveRef.current = setTimeout(() => {
        logger.info('💾 Saving chat after AI response completed (onFinish)');
        // Use the ref to get the latest messages (not stale closure)
        const currentMessages = messagesRef.current;
        if (currentMessages.length === 0) {
          logger.warn('⚠️ No messages to save');
          return;
        }
        setIsSaving(true);
        storeMessageHistory(currentMessages)
          .then(() => {
            setIsSaving(false);
            setLastSaved(new Date());
            logger.info('✅ Chat saved successfully after AI response (onFinish)');
          })
          .catch((error) => {
            setIsSaving(false);
            logger.error('Failed to save after AI response:', error);
          });
      }, 500);
    },
    onResponse: (response) => {
      // console.log('📥 Response received:', response.status, response.statusText);
    },
    initialMessages,
  });
  
  // 🔧 FIX: Keep messagesRef in sync with messages state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Draft auto-save: persist chat input to localStorage, restore on page refresh
  const { clearDraft, wasDraftRestored } = useChatDraft(chatId, input, setInput);
  clearDraftRef.current = clearDraft;

  const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
  const { parsedMessages, parseMessages } = useMessageParser();

  // State for edit intent preview visibility
  const [showEditIntentPreview, setShowEditIntentPreview] = useState(true);

  // Enhanced input change handler that also triggers intent analysis
  const handleInputChangeWithIntent = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleInputChange(e);
    // Trigger intent analysis on input change
    if (isIntentReady && chatStarted) {
      analyzePromptDebounced(e.target.value);
    }
  }, [handleInputChange, analyzePromptDebounced, isIntentReady, chatStarted]);

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
    // console.log('🔄 [ChatImpl] Chat started state updated:', hasMessages, 'messages:', initialMessages.length);
  }, [initialMessages]);

  // Store the previous isLoading state to detect when streaming completes
  const prevIsLoading = useRef(isLoading);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    parseMessages(messages, isLoading);

    // Save chat history whenever messages change
    // 🚀 OPTIMIZATION: Use debouncing but with shorter delays since onFinish handles immediate saves
    if (messages.length > 0) {
      // Clear any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const streamingJustFinished = prevIsLoading.current && !isLoading;
      prevIsLoading.current = isLoading;

      // 🚀 OPTIMIZATION: Reduced delays since onFinish now handles immediate saves
      // This save is a backup/periodic save during long conversations
      // streamingJustFinished: 2s (to allow files to be written)
      // not loading: 2s (normal periodic save)
      // loading (streaming): skip - let onFinish handle it
      if (isLoading) {
        // Don't save during streaming - wait for onFinish
        return;
      }

      // 🔧 FIX: If streaming just finished and onFinish already saved, skip this save
      // This prevents the double save issue
      if (streamingJustFinished && onFinishSavedRef.current) {
        logger.debug('Skipping useEffect save - onFinish already handled it');
        // Reset the flag after a delay to allow future manual saves
        setTimeout(() => {
          onFinishSavedRef.current = false;
        }, 3000);
        return;
      }

      const saveDelay = streamingJustFinished ? 2000 : 2000;

      saveTimeoutRef.current = setTimeout(() => {
        // 🔧 FIX: Double-check the flag right before saving
        if (onFinishSavedRef.current) {
          logger.debug('Skipping save - onFinish already handled it');
          return;
        }
        setIsSaving(true);
        logger.info('💾 Saving chat from useEffect');
        storeMessageHistory(messages)
          .then(() => {
            setIsSaving(false);
            setLastSaved(new Date());
            logger.info('✅ Chat saved successfully from useEffect');
          })
          .catch((error) => {
            setIsSaving(false);
            logger.error('Failed to save chat history:', error);
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

  // Ref to always track the latest sendMessage for deferred calls (e.g. auto-fix)
  const sendMessageRef = useRef<typeof sendMessage>(null!);

  const sendMessage = async (_event: React.UIEvent, messageInput?: string, attachments?: FileAttachment[]) => {
    const _input = messageInput || input;

    // console.log('📤 Sending message:', _input.substring(0, 100));

    // Allow sending with just attachments (no text required)
    if (_input.length === 0 && (!attachments || attachments.length === 0)) {
      logger.warn('⚠️ Message not sent - empty input and no attachments');
      return;
    }

    if (isLoading) {
      logger.warn('⚠️ Message not sent - already loading');
      return;
    }

    // Agent Mode: Route through agent orchestrator instead of normal chat
    if (chatMode === 'agent' && !isAgentActive) {
      logger.info('🤖 Agent mode - starting agent session');
      workbenchStore.showWorkbench.set(true);
      setInput('');
      clearDraft();
      // Add the user message to chat for display
      append({ role: 'user', content: _input });
      // Start the agent session (runs autonomously)
      startAgent(_input);
      runAnimation();
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

    // Load code context for AI awareness before sending
    // This helps AI understand existing code when modifying files
    const contextPrompt = await loadCodeContext(_input);
    if (contextPrompt) {
      logger.debug('Loaded code context for AI');
    }

    const fileModifications = workbenchStore.getFileModifcations();

    chatStore.setKey('aborted', false);

    runAnimation();

    // Build message content with attachments
    let messageContent = '';

    // Add attachment information if present
    if (attachments && attachments.length > 0) {
      const imageAttachments = attachments.filter(a => a.file.type.startsWith('image/'));
      const otherAttachments = attachments.filter(a => !a.file.type.startsWith('image/'));

      // For images, include base64 data for vision models
      if (imageAttachments.length > 0) {
        messageContent += '[Attached Images]\n';
        for (const attachment of imageAttachments) {
          if (attachment.base64) {
            // Format as data URL for vision models
            messageContent += `![${attachment.file.name}](data:${attachment.file.type};base64,${attachment.base64})\n`;
          } else {
            messageContent += `- Image: ${attachment.file.name} (${(attachment.file.size / 1024).toFixed(1)}KB)\n`;
          }
        }
        messageContent += '\n';
      }

      // For other files, just list them with metadata
      if (otherAttachments.length > 0) {
        messageContent += '[Attached Files]\n';
        for (const attachment of otherAttachments) {
          messageContent += `- ${attachment.file.name} (${attachment.file.type}, ${(attachment.file.size / 1024).toFixed(1)}KB)\n`;
        }
        messageContent += '\n';
      }
    }

    // Add the user's text input
    if (_input.length > 0) {
      messageContent += _input;
    } else if (attachments && attachments.length > 0) {
      // If only attachments, add a prompt about them
      messageContent += 'Please analyze the attached files.';
    }

    if (fileModifications !== undefined) {
      const diff = fileModificationsToHTML(fileModifications);

      /**
       * If we have file modifications we append a new user message manually since we have to prefix
       * the user input with the file modifications and we don't want the new user input to appear
       * in the prompt. Using `append` is almost the same as `handleSubmit` except that we have to
       * manually reset the input and we'd have to manually pass in file attachments. However, those
       * aren't relevant here.
       */
      // console.log('📤 Sending with file modifications');
      append({ role: 'user', content: `${diff}\n\n${messageContent}` });

      /**
       * After sending a new message we reset all modifications since the model
       * should now be aware of all the changes.
       */
      workbenchStore.resetAllFileModifications();
    } else {
      // console.log('📤 Sending without file modifications');
      append({ role: 'user', content: messageContent });
    }

    setInput('');
    clearDraft();

    resetEnhancer();
    clearAnalysis(); // Clear edit intent analysis after sending

    textareaRef.current?.blur();
  };

  // Keep ref in sync so deferred callers always use the latest sendMessage
  sendMessageRef.current = sendMessage;

  // Handle cloned website files
  const handleCloneComplete = async (data: { files: Record<string, string>; prompt: string; title: string }) => {
    logger.info(`Clone complete: ${Object.keys(data.files).length} files`);

    // Create files using import event
    window.dispatchEvent(new CustomEvent('recoder:import', {
      detail: {
        files: data.files,
        repository: { name: data.title },
        prompt: data.prompt,
      }
    }));
  };

  // Handle GitHub repository import
  const handleGitHubImport = (repoData: { files: Record<string, string>; repository: any }) => {
    logger.info(`GitHub import: ${Object.keys(repoData.files).length} files from ${repoData.repository.name}`);

    // Create files using import event
    window.dispatchEvent(new CustomEvent('recoder:import', {
      detail: {
        files: repoData.files,
        repository: repoData.repository,
        prompt: `I imported the repository "${repoData.repository.name}" (${repoData.repository.description || 'no description'}). Please analyze the codebase structure and let me know how I can help you work with this project.`,
      }
    }));

    setShowGitHubModal(false);
  };

  // Listen for "Fix with AI" events from Problems panel and auto-fix feature.
  // Uses isLoadingRef to avoid re-attaching the listener every render.
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  useEffect(() => {
    const handleFixErrors = async (event: CustomEvent) => {
      const { prompt, auto } = event.detail || {};

      // Only proceed if we have a prompt and are not currently loading
      if (prompt && !isLoadingRef.current) {
        if (auto) {
          logger.info('[Chat] Auto-fix triggered, sending error fix request to AI');
          // Switch to fast profile for quick error fixes.
          // flushSync forces React to re-render synchronously so the
          // useSimpleChat body (extraBodyRef) has the new model/provider
          // BEFORE sendMessage fires the fetch request.
          selectErrorFixProfile();
          const fastModel = activeProfileModelStore.get();
          flushSync(() => {
            setSelectedModel(fastModel);
            setSelectedProvider('openrouter');
          });
        }
        sendMessageRef.current({} as React.UIEvent, prompt);
      } else if (!prompt) {
        logger.warn('[Chat] recoder:fix-errors event received without prompt');
      } else if (isLoadingRef.current) {
        logger.info('[Chat] Fix request skipped - AI is currently responding');
      }
    };

    window.addEventListener('recoder:fix-errors', handleFixErrors as any);

    return () => {
      window.removeEventListener('recoder:fix-errors', handleFixErrors as any);
    };
  }, []);

  // Listen for spawn task events from AI actions
  useEffect(() => {
    const handleSpawnTask = async (event: CustomEvent) => {
      const { taskId, prompt, mode } = event.detail;

      logger.info(`[Spawn Task] Received task ${taskId}:`, prompt?.substring(0, 100));

      // Switch mode if specified
      if (mode && mode !== 'code') {
        try {
          const { setMode } = await import('~/lib/stores/mode');
          setMode(mode);
          logger.info(`[Spawn Task] Switched to ${mode} mode`);
        } catch (error) {
          logger.warn('[Spawn Task] Failed to switch mode:', error);
        }
      }

      // Send the task as a message to the AI
      if (prompt && !isLoadingRef.current) {
        // Small delay to ensure mode switch takes effect
        setTimeout(() => {
          sendMessageRef.current({} as React.UIEvent, prompt);
        }, 100);
      }
    };

    window.addEventListener('recoder:spawn-task', handleSpawnTask as any);

    return () => {
      window.removeEventListener('recoder:spawn-task', handleSpawnTask as any);
    };
  }, []);

  // Listen for import events from GitHub/Starters/Templates
  useEffect(() => {
    const handleImport = async (event: CustomEvent) => {
      const { prompt, files, repository, template, isLocal } = event.detail;

      // DIRECTLY create files in workbench using actions
      const fileEntries = Object.entries(files);
      let createdCount = 0;

      // Create a special artifact for imports
      const messageId = `import_${Date.now()}`;
      const artifactId = `artifact_${messageId}`;

      // Open the artifact first
      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact({
        messageId,
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
            logger.error(`   ❌ Failed to create file ${filePath}:`, error);
          }
        }));

        // Log progress after each batch
        // console.log(`   ✅ Created ${createdCount}/${fileEntries.length} files (${Math.round((createdCount/fileEntries.length) * 100)}%)`);

        // Small delay between batches to avoid overwhelming system
        if (i + batchSize < fileEntries.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // console.log(`✅ Import complete: ${createdCount}/${fileEntries.length} files created`);

      // After files are created, optionally send AI message about the import
      if (prompt && !isLoadingRef.current) {
        setTimeout(() => {
          // console.log('✨ Notifying AI about imported files');
          sendMessageRef.current({} as React.UIEvent, prompt);
        }, 500);
      }
    };

    window.addEventListener('recoder:import', handleImport as any);

    return () => {
      window.removeEventListener('recoder:import', handleImport as any);
    };
  }, []);

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
        onProviderChange={setSelectedProvider}
        onModelChange={setSelectedModel}
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
        handleInputChange={handleInputChangeWithIntent}
        handleStop={abort}
        editIntentPreview={
          chatStarted && showEditIntentPreview ? (
            <EditIntentPreview
              intent={editIntent}
              isAnalyzing={isAnalyzingIntent}
              preview={editPreview}
              error={intentError}
              expanded={false}
              onToggle={() => setShowEditIntentPreview(!showEditIntentPreview)}
            />
          ) : null
        }
        messages={messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          // For assistant messages, use parsed content if available, otherwise use original content
          // This ensures loaded historical messages display correctly
          return {
            ...message,
            content: parsedMessages[i] || message.content || '',
          };
        })}
        enhancePrompt={() => {
          enhancePrompt(input, (input) => {
            setInput(input);
            scrollTextArea();
          });
        }}
      />

      {/* Keyboard Shortcuts Dialog (lazy-loaded) */}
      {showShortcutsDialog && (
        <Suspense fallback={null}>
          <KeyboardShortcutsDialog
            open={showShortcutsDialog}
            onClose={() => setShowShortcutsDialog(false)}
          />
        </Suspense>
      )}

      {/* Save Indicator */}
      <SaveIndicator isSaving={isSaving} lastSaved={lastSaved} />

      {/* QuickActions FAB removed — cluttered the UI */}

      {/* Clone Website Modal */}
      <CloneUrlModal
        open={showCloneModal}
        onClose={() => setShowCloneModal(false)}
        onCloneComplete={handleCloneComplete}
      />

      {/* GitHub Import Modal (lazy-loaded) */}
      {showGitHubModal && (
        <Suspense fallback={null}>
          <GitHubImporter
            onImport={handleGitHubImport}
            onClose={() => setShowGitHubModal(false)}
          />
        </Suspense>
      )}

      {/* Deploy Modal (lazy-loaded) */}
      {showDeployModal && (
        <Suspense fallback={null}>
          <DeploymentModal
            open={showDeployModal}
            onClose={() => setShowDeployModal(false)}
          />
        </Suspense>
      )}

      {/* VS Code-style Command Palette (lazy-loaded) */}
      {isCommandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
    </>
  );
});
