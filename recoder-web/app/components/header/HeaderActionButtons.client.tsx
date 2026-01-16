import { useStore } from '@nanostores/react';
import { useState, useEffect } from 'react';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { GitHubIntegration } from '~/components/github/GitHubIntegration';
import { DeployButton } from '~/components/deployment/DeployButton';
import { SaveToProject } from '~/components/chat/SaveToProject';
import { clearGitHubSyncCache } from '~/lib/runtime/github-auto-sync';
import type { TemplateRepo } from '~/lib/.server/github/types';

interface HeaderActionButtonsProps {}

export function HeaderActionButtons({}: HeaderActionButtonsProps) {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const { showChat } = useStore(chatStore);
  const [showGitHubIntegration, setShowGitHubIntegration] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);

  useEffect(() => {
    // Get chatId from URL
    const match = window.location.pathname.match(/\/chat\/([^\/]+)/);
    setChatId(match ? match[1] : null);
  }, []);

  const canHideChat = showWorkbench || !showChat;

  const handleImportComplete = async (data: { files: Record<string, string>; repository: any; template?: TemplateRepo }) => {
    const repoInfo = data.repository;
    const fileCount = Object.keys(data.files).length;
    const isLocalStarter = data.template?.isLocal === true;

    console.log('📦 Import complete:', {
      repository: repoInfo.name,
      fileCount,
      template: data.template?.name,
      isLocal: isLocalStarter,
      files: Object.keys(data.files).slice(0, 10)
    });

    // Connect to GitHub for auto-sync (only for non-local repos with full_name)
    if (chatId && repoInfo.full_name && !isLocalStarter) {
      try {
        await fetch(`/api/chat/${chatId}/github`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'connect', 
            repo: repoInfo.full_name,
            branch: repoInfo.default_branch || 'main'
          })
        });
        console.log('🔗 Connected to GitHub for auto-sync:', repoInfo.full_name);
        clearGitHubSyncCache(); // Clear cache so new connection is picked up
      } catch (e) {
        console.warn('Failed to connect GitHub for auto-sync:', e);
      }
    }

    // For LOCAL starters: NO AI prompt, files are directly imported
    // For GitHub templates: Use AI prompt to set up and customize
    let prompt: string | undefined;

    if (!isLocalStarter) {
      // Only create prompts for non-local (GitHub) templates
      if (data.template) {
        // Use template-specific caching for better performance
        prompt = `I've imported the ${data.template.name} template with ${fileCount} files. Please set up this project:

Template: ${data.template.name}
Category: ${data.template.category}
Description: ${data.template.description}
Framework: ${data.template.category}

Please create all the necessary files, install dependencies, and set up the development environment. The project should be ready to run.`;
      } else {
        // For custom repository imports
        const fileList = Object.keys(data.files).slice(0, 15).join(', ');
        const moreFiles = fileCount > 15 ? ` and ${fileCount - 15} more files` : '';

        prompt = `I've imported the repository "${repoInfo.name}" with ${fileCount} files. Please set up this project:

Description: ${repoInfo.description || 'No description available'}
Language: ${repoInfo.language || 'Unknown'}
Key files: ${fileList}${moreFiles}

Please analyze the project structure, create all files, install dependencies, and make it ready to run.`;
      }
    }

    console.log(isLocalStarter ? '📁 Local starter: files will be imported directly without AI' : '🤖 GitHub template: AI will help set up the project');

    // Show workbench and chat
    workbenchStore.showWorkbench.set(true);
    if (!showChat) {
      chatStore.setKey('showChat', true);
    }

    // Dispatch a custom event that the chat component can listen to
    window.dispatchEvent(new CustomEvent('recoder:import', {
      detail: {
        prompt, // undefined for local starters
        files: data.files,
        repository: repoInfo,
        template: data.template,
        isLocal: isLocalStarter
      }
    }));

    console.log('✅ Import data prepared, dispatched recoder:import event');
    setShowGitHubIntegration(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="flex items-center border border-bolt-elements-borderColor rounded-md overflow-hidden">
          <Button
            active={showChat}
            disabled={!canHideChat}
            onClick={() => {
              if (canHideChat) {
                chatStore.setKey('showChat', !showChat);
              }
            }}
          >
            <div className="i-bolt:chat text-sm" />
          </Button>
          <div className="w-[1px] bg-bolt-elements-borderColor" />
          <Button
            active={showWorkbench}
            onClick={() => {
              if (showWorkbench && !showChat) {
                chatStore.setKey('showChat', true);
              }

              workbenchStore.showWorkbench.set(!showWorkbench);
            }}
          >
            <div className="i-ph:code-bold" />
          </Button>
        </div>

        {/* Save to Project Button */}
        {chatId && <SaveToProject chatId={chatId} />}

        {/* GitHub Integration Button */}
        <Button
          onClick={() => setShowGitHubIntegration(true)}
          title="Import from GitHub"
        >
          <div className="i-ph:github-logo text-sm" />
        </Button>

        {/* Deploy Button - Only show when workbench is visible */}
        {showWorkbench && (
          <DeployButton />
        )}
      </div>

      {showGitHubIntegration && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-bolt-elements-background-depth-1 rounded-lg shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">
                Import from GitHub
              </h2>
              <button
                onClick={() => setShowGitHubIntegration(false)}
                className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              >
                <div className="i-ph:x text-lg" />
              </button>
            </div>
            <GitHubIntegration onImportComplete={handleImportComplete} />
          </div>
        </div>
      )}
    </>
  );
}

interface ButtonProps {
  active?: boolean;
  disabled?: boolean;
  children?: any;
  onClick?: VoidFunction;
  title?: string;
}

function Button({ active = false, disabled = false, children, onClick, title }: ButtonProps) {
  return (
    <button
      className={classNames('flex items-center p-1.5', {
        'bg-bolt-elements-item-backgroundDefault hover:bg-bolt-elements-item-backgroundActive text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary':
          !active,
        'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent': active && !disabled,
        'bg-bolt-elements-item-backgroundDefault text-alpha-gray-20 dark:text-alpha-white-20 cursor-not-allowed':
          disabled,
      })}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
