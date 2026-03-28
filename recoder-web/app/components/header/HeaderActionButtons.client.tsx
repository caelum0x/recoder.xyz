import { useStore } from '@nanostores/react';
import { useState, useEffect, useRef } from 'react';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore, type PublishState, type CustomDomainInfo } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { GitHubImporter } from '~/components/github/GitHubImporter';
import { DeployButton } from '~/components/deployment/DeployButton';
import { SaveToProject } from '~/components/chat/SaveToProject';
import { clearGitHubSyncCache } from '~/lib/runtime/github-auto-sync';
import { dockerPost } from '~/lib/services/docker-api';

import type { TemplateRepo } from '~/lib/.server/github/types';

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('HeaderActions');

interface HeaderActionButtonsProps {}

export function HeaderActionButtons({}: HeaderActionButtonsProps) {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const { showChat } = useStore(chatStore);
  const [showGitHubIntegration, setShowGitHubIntegration] = useState(false);
  const [showFigmaImport, setShowFigmaImport] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaToken, setFigmaToken] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('figma_token') || '' : '',
  );
  const [figmaImporting, setFigmaImporting] = useState(false);
  const [figmaResult, setFigmaResult] = useState<{ files: string[]; componentCount: number } | null>(null);
  const [figmaError, setFigmaError] = useState<string | null>(null);
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

    logger.info('📦 Import complete:', {
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
        logger.info('🔗 Connected to GitHub for auto-sync:', repoInfo.full_name);
        clearGitHubSyncCache(); // Clear cache so new connection is picked up
      } catch (e) {
        logger.warn('Failed to connect GitHub for auto-sync:', e);
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

    logger.info(isLocalStarter ? '📁 Local starter: files will be imported directly without AI' : '🤖 GitHub template: AI will help set up the project');

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

    logger.info('✅ Import data prepared, dispatched recoder:import event');
    setShowGitHubIntegration(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-md overflow-hidden border border-recoder-elements-borderColor">
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
          <div className="w-[1px] bg-recoder-elements-borderColor" />
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

        {/* Figma Import Button */}
        {showWorkbench && (
          <Button
            onClick={() => setShowFigmaImport(true)}
            title="Import from Figma"
          >
            <div className="i-ph:figma-logo text-sm" />
          </Button>
        )}

        {/* Deploy Button - Only show when workbench is visible */}
        {showWorkbench && (
          <DeployButton />
        )}

        {/* Go Live Button - Only show when workbench is visible */}
        {showWorkbench && (
          <GoLiveButton />
        )}
      </div>

      {showGitHubIntegration && (
        <GitHubImporter
          onImport={(data) => {
            handleImportComplete(data);
          }}
          onClose={() => setShowGitHubIntegration(false)}
        />
      )}

      {showFigmaImport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="rounded-lg shadow-xl p-6 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-recoder-elements-textPrimary">
                Import from Figma
              </h2>
              <button
                onClick={() => { setShowFigmaImport(false); setFigmaResult(null); setFigmaError(null); }}
                className="text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary transition-colors"
              >
                <div className="i-ph:x text-lg" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-recoder-elements-textSecondary text-sm">Figma File URL</label>
                <input
                  type="text"
                  value={figmaUrl}
                  onChange={(e) => setFigmaUrl(e.target.value)}
                  placeholder="https://www.figma.com/file/..."
                  className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-sm rounded-md px-3 py-2 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-recoder-elements-textSecondary text-sm">Figma Personal Access Token</label>
                <input
                  type="password"
                  value={figmaToken}
                  onChange={(e) => { setFigmaToken(e.target.value); localStorage.setItem('figma_token', e.target.value); }}
                  placeholder="figd_..."
                  className="bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-sm rounded-md px-3 py-2 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColorActive w-full"
                />
                <a
                  href="https://www.figma.com/developers/api#access-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 text-xs hover:text-purple-300 transition-colors"
                >
                  Get token from figma.com
                </a>
              </div>

              <button
                onClick={async () => {
                  const projectId = workbenchStore.projectId.get();
                  if (!figmaUrl || !figmaToken || !projectId || figmaImporting) return;

                  setFigmaImporting(true);
                  setFigmaResult(null);
                  setFigmaError(null);

                  try {
                    const data = await dockerPost<{ data: { files: string[]; componentCount: number } }>(
                      `/api/figma-import/${projectId}`,
                      { figmaUrl, figmaToken },
                    );
                    const result = ((data as any).data || data) as { files: string[]; componentCount: number };
                    setFigmaResult(result);
                  } catch (err: any) {
                    setFigmaError(err?.message || 'Failed to import from Figma');
                  } finally {
                    setFigmaImporting(false);
                  }
                }}
                disabled={!figmaUrl || !figmaToken || figmaImporting}
                className={classNames(
                  'w-full py-2.5 rounded-md text-sm font-medium transition-colors',
                  !figmaUrl || !figmaToken || figmaImporting
                    ? 'bg-recoder-elements-button-secondary-background text-recoder-elements-textTertiary cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-500',
                )}
              >
                {figmaImporting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="i-svg-spinners:90-ring-with-bg text-sm" />
                    Importing...
                  </span>
                ) : (
                  'Import Components'
                )}
              </button>

              {figmaResult && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-md p-3 text-green-400 text-sm">
                  Imported {figmaResult.componentCount} component{figmaResult.componentCount !== 1 ? 's' : ''}:
                  <ul className="mt-1 text-xs text-green-400/80">
                    {figmaResult.files.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {figmaError && (
                <div className="text-red-400 text-sm">{figmaError}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ==================== Go Live Button ====================

function GoLiveButton() {
  const publishState = useStore(workbenchStore.publishState) as PublishState;
  const [showPopover, setShowPopover] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [showDomainForm, setShowDomainForm] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domainInstructions, setDomainInstructions] = useState<any>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Check publish status on mount
  useEffect(() => {
    workbenchStore.checkPublishStatus();
  }, []);

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPopover]);

  const handleGoLive = async () => {
    if (publishState.status === 'published') {
      setShowPopover(!showPopover);
      return;
    }
    if (publishState.status === 'building' || publishState.status === 'publishing') {
      return; // Already in progress
    }
    await workbenchStore.publishProject();
  };

  const handleCopyUrl = () => {
    if (publishState.url) {
      navigator.clipboard.writeText(publishState.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleUpdate = async () => {
    setShowPopover(false);
    await workbenchStore.publishProject();
  };

  const handleUnpublish = async () => {
    setShowPopover(false);
    await workbenchStore.unpublishProject();
  };

  const isLoading = publishState.status === 'building' || publishState.status === 'publishing';
  const isPublished = publishState.status === 'published';

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={handleGoLive}
        disabled={isLoading}
        className={classNames(
          'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all shadow-lg hover:shadow-xl',
          isPublished
            ? 'bg-green-600 hover:bg-green-500 text-white'
            : isLoading
            ? 'bg-amber-600 text-white cursor-wait'
            : publishState.status === 'error'
            ? 'bg-red-600/80 hover:bg-red-500 text-white'
            : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white hover:shadow-lg hover:shadow-blue-500/20'
        )}
        title={isPublished ? 'Published - click for options' : isLoading ? 'Publishing...' : 'Publish your project'}
      >
        {isLoading ? (
          <>
            <div className="i-ph:spinner-gap animate-spin text-sm" />
            <span>Publishing...</span>
          </>
        ) : isPublished ? (
          <>
            <div className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
            <span>Live</span>
          </>
        ) : publishState.status === 'error' ? (
          <>
            <div className="i-ph:warning text-sm" />
            <span>Retry</span>
          </>
        ) : (
          <>
            <div className="i-ph:globe text-sm" />
            <span>Go Live</span>
          </>
        )}
      </button>

      {/* Published Popover */}
      {showPopover && isPublished && publishState.url && (
        <div
          className="absolute right-0 top-full mt-2 w-72 rounded-lg shadow-xl z-50 overflow-hidden"
          style={{ backgroundColor: 'var(--recoder-elements-bg-depth-1)', border: '1px solid var(--recoder-elements-borderColor)' }}
        >
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-recoder-elements-textSecondary">Published URL</div>
              {!editingSlug && (
                <button
                  onClick={() => {
                    setNewSlug(publishState.slug || '');
                    setSlugError(null);
                    setEditingSlug(true);
                  }}
                  className="text-[10px] text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary transition-colors"
                  title="Edit URL slug"
                >
                  <div className="i-ph:pencil-simple text-xs" />
                </button>
              )}
            </div>

            {editingSlug ? (
              <div className="mb-3">
                <div className="flex items-center gap-1 p-2 rounded-md" style={{ backgroundColor: 'var(--recoder-elements-bg-depth-2)' }}>
                  <span className="text-[10px] text-recoder-elements-textSecondary whitespace-nowrap">web.recoder.xyz/</span>
                  <input
                    type="text"
                    value={newSlug}
                    onChange={(e) => {
                      setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                      setSlugError(null);
                    }}
                    className="flex-1 bg-transparent text-xs text-recoder-elements-textPrimary outline-none border-none min-w-0"
                    placeholder="my-project"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setEditingSlug(false);
                        setSlugError(null);
                      }
                    }}
                  />
                </div>
                {slugError && (
                  <div className="text-[10px] text-red-400 mt-1">{slugError}</div>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={async () => {
                      if (!newSlug.trim()) {
                        setSlugError('Slug cannot be empty');
                        return;
                      }
                      setSlugSaving(true);
                      setSlugError(null);
                      const success = await workbenchStore.changeSlug(newSlug.trim());
                      setSlugSaving(false);
                      if (success) {
                        setEditingSlug(false);
                      } else {
                        setSlugError('Failed to change slug. It may be taken or invalid.');
                      }
                    }}
                    disabled={slugSaving || !newSlug.trim() || newSlug === publishState.slug}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {slugSaving ? (
                      <div className="i-ph:spinner-gap animate-spin text-xs" />
                    ) : (
                      <div className="i-ph:check text-xs" />
                    )}
                    {slugSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingSlug(false);
                      setSlugError(null);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-medium text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-2 transition-colors"
                    style={{ border: '1px solid var(--recoder-elements-borderColor)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-md" style={{ backgroundColor: 'var(--recoder-elements-bg-depth-2)' }}>
                <span className="text-xs text-recoder-elements-textPrimary truncate flex-1">{publishState.url}</span>
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleCopyUrl}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-2"
                style={{ border: '1px solid var(--recoder-elements-borderColor)' }}
              >
                <div className={copied ? 'i-ph:check' : 'i-ph:copy'} />
                {copied ? 'Copied' : 'Copy URL'}
              </button>
              <a
                href={publishState.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-2"
                style={{ border: '1px solid var(--recoder-elements-borderColor)' }}
              >
                <div className="i-ph:arrow-square-out" />
                Open
              </a>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={handleUpdate}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors"
              >
                <div className="i-ph:arrow-clockwise" />
                Update
              </button>
              <button
                onClick={handleUnpublish}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                style={{ border: '1px solid var(--recoder-elements-borderColor)' }}
              >
                <div className="i-ph:trash" />
                Unpublish
              </button>
            </div>

            {/* Custom Domains Section */}
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--recoder-elements-borderColor)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-recoder-elements-textSecondary">Custom Domains</div>
                <button
                  onClick={() => {
                    setShowDomainForm(!showDomainForm);
                    setDomainError(null);
                    setDomainInstructions(null);
                  }}
                  className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {showDomainForm ? 'Cancel' : '+ Add'}
                </button>
              </div>

              {/* Existing domains list */}
              {publishState.customDomains && publishState.customDomains.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {publishState.customDomains.map((d: CustomDomainInfo) => (
                    <div
                      key={d.domain}
                      className="flex items-center gap-2 p-1.5 rounded-md text-xs"
                      style={{ backgroundColor: 'var(--recoder-elements-bg-depth-2)' }}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        d.status === 'active' ? 'bg-green-400' :
                        d.status === 'error' ? 'bg-red-400' :
                        'bg-amber-400 animate-pulse'
                      }`} />
                      <span className="flex-1 truncate text-recoder-elements-textPrimary">{d.domain}</span>
                      {d.status === 'active' && d.url && (
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <div className="i-ph:arrow-square-out text-[10px]" />
                        </a>
                      )}
                      {(d.status === 'pending_dns' || d.status === 'dns_verified') && (
                        <button
                          onClick={async () => {
                            setDomainLoading(true);
                            const result = await workbenchStore.activateCustomDomain(d.domain);
                            setDomainLoading(false);
                            if (!result.success) {
                              setDomainError(result.error || 'Activation failed');
                            }
                          }}
                          className="text-[10px] text-amber-400 hover:text-amber-300"
                          title="Verify & Activate"
                        >
                          {domainLoading ? '...' : 'Activate'}
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          await workbenchStore.removeCustomDomain(d.domain);
                        }}
                        className="text-red-400/60 hover:text-red-400 transition-colors"
                        title="Remove domain"
                      >
                        <div className="i-ph:x text-[10px]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add domain form */}
              {showDomainForm && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newDomain}
                    onChange={(e) => {
                      setNewDomain(e.target.value.toLowerCase().trim());
                      setDomainError(null);
                    }}
                    className="w-full px-2 py-1.5 rounded-md text-xs bg-transparent text-recoder-elements-textPrimary outline-none"
                    style={{ backgroundColor: 'var(--recoder-elements-bg-depth-2)', border: '1px solid var(--recoder-elements-borderColor)' }}
                    placeholder="example.com"
                    autoFocus
                  />
                  {domainError && (
                    <div className="text-[10px] text-red-400">{domainError}</div>
                  )}
                  {domainInstructions && (
                    <div className="p-2 rounded-md text-[10px] space-y-1" style={{ backgroundColor: 'var(--recoder-elements-bg-depth-2)' }}>
                      <div className="font-medium text-recoder-elements-textPrimary">DNS Setup Required:</div>
                      <div className="text-recoder-elements-textSecondary">
                        Add a <span className="text-blue-400">CNAME</span> record:
                      </div>
                      <div className="font-mono text-recoder-elements-textPrimary">
                        {domainInstructions.cname?.name} → {domainInstructions.cname?.value}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      if (!newDomain) return;
                      setDomainLoading(true);
                      setDomainError(null);
                      const result = await workbenchStore.addCustomDomain(newDomain);
                      setDomainLoading(false);
                      if (result.success) {
                        setDomainInstructions(result.instructions);
                        setNewDomain('');
                      } else {
                        setDomainError(result.error || 'Failed to add domain');
                      }
                    }}
                    disabled={domainLoading || !newDomain}
                    className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {domainLoading ? (
                      <div className="i-ph:spinner-gap animate-spin text-xs" />
                    ) : (
                      <div className="i-ph:plus text-xs" />
                    )}
                    {domainLoading ? 'Adding...' : 'Add Domain'}
                  </button>
                </div>
              )}

              {!showDomainForm && (!publishState.customDomains || publishState.customDomains.length === 0) && (
                <div className="text-[10px] text-recoder-elements-textTertiary">
                  No custom domains. Add one to use your own domain.
                </div>
              )}
            </div>
          </div>
          {publishState.publishedAt && (
            <div className="px-3 py-2 text-[10px] text-recoder-elements-textTertiary border-t" style={{ borderColor: 'var(--recoder-elements-borderColor)' }}>
              Last published: {new Date(publishState.publishedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Error tooltip */}
      {publishState.status === 'error' && publishState.error && (
        <div
          className="absolute right-0 top-full mt-2 w-64 p-3 rounded-lg shadow-xl z-50 text-xs text-red-400"
          style={{ backgroundColor: 'var(--recoder-elements-bg-depth-1)', border: '1px solid var(--recoder-elements-borderColor)' }}
        >
          {publishState.error}
        </div>
      )}
    </div>
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
  const getStyles = () => {
    if (disabled) {
      return {
        backgroundColor: 'transparent',
        color: 'var(--recoder-elements-textTertiary)',
        cursor: 'not-allowed',
      };
    }
    if (active) {
      return {
        backgroundColor: '#F79009',
        color: '#ffffff',
      };
    }
    return {
      backgroundColor: 'transparent',
      color: 'var(--recoder-elements-textSecondary)',
    };
  };

  return (
    <button
      className="flex items-center p-1.5 transition-colors hover:bg-recoder-elements-background-depth-3 hover:text-recoder-elements-textPrimary"
      style={getStyles()}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
