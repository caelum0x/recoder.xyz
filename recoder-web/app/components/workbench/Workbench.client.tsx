import { useStore } from '@nanostores/react';
import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { computed } from 'nanostores';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { Slider, type SliderOptions } from '~/components/ui/Slider';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { renderLogger } from '~/utils/logger';
import { EditorPanel } from './EditorPanel';
import { Preview } from './Preview';
import { GitHubSyncModal } from './GitHubSyncModal';
import { BuildProgressIndicator } from './BuildProgressIndicator';

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
}

const viewTransition = { ease: cubicEasingFn };

const sliderOptions: SliderOptions<WorkbenchViewType> = {
  left: {
    value: 'code',
    text: 'Code',
  },
  right: {
    value: 'preview',
    text: 'Preview',
  },
};

const workbenchVariants = {
  closed: {
    width: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    width: 'var(--workbench-width)',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

export const Workbench = memo(({ chatStarted, isStreaming }: WorkspaceProps) => {
  renderLogger.trace('Workbench');

  const hasPreview = useStore(computed(workbenchStore.previews, (previews) => previews.length > 0));
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const files = useStore(workbenchStore.files);
  const selectedView = useStore(workbenchStore.currentView);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const setSelectedView = (view: WorkbenchViewType) => {
    workbenchStore.currentView.set(view);
  };

  useEffect(() => {
    if (hasPreview) {
      setSelectedView('preview');
    }
  }, [hasPreview]);

  useEffect(() => {
    workbenchStore.setDocuments(files);
  }, [files]);

  const onEditorChange = useCallback<OnEditorChange>((update) => {
    workbenchStore.setCurrentDocumentContent(update.content);
  }, []);

  const onEditorScroll = useCallback<OnEditorScroll>((position) => {
    workbenchStore.setCurrentDocumentScrollPosition(position);
  }, []);

  const onFileSelect = useCallback((filePath: string | undefined) => {
    workbenchStore.setSelectedFile(filePath);
  }, []);

  const onFileSave = useCallback(() => {
    workbenchStore.saveCurrentDocument().catch(() => {
      toast.error('Failed to update file content');
    });
  }, []);

  const onFileReset = useCallback(() => {
    workbenchStore.resetCurrentDocument();
  }, []);

  const [isDownloading, setIsDownloading] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);

  const handleDownloadCode = useCallback(async () => {
    setIsDownloading(true);
    try {
      // console.log('📥 Downloading code...');

      // Convert files to plain object
      const filesToDownload: Record<string, string> = {};
      Object.entries(files).forEach(([path, file]) => {
        if (file.type === 'file') {
          filesToDownload[path] = file.content;
        }
      });

      if (Object.keys(filesToDownload).length === 0) {
        toast.error('No files to download');
        return;
      }

      const response = await fetch('/api/download-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: filesToDownload,
          projectName: 'recoder-project',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to download code');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recoder-project.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Code downloaded successfully!');
    } catch (error) {
      console.error('❌ Download failed:', error);
      toast.error('Failed to download code');
    } finally {
      setIsDownloading(false);
    }
  }, [files]);

  const handlePushToGitHub = useCallback(async () => {
    setIsPushing(true);
    try {
      // Convert files to plain object
      const filesToPush: Record<string, string> = {};
      Object.entries(files).forEach(([path, file]) => {
        if (file.type === 'file') {
          filesToPush[path] = file.content;
        }
      });

      if (Object.keys(filesToPush).length === 0) {
        toast.error('No files to push');
        return;
      }

      // Prompt for repository name
      const repoName = prompt('Enter repository name:', 'my-recoder-project');
      if (!repoName) {
        toast.info('GitHub push cancelled');
        return;
      }

      // Prompt for GitHub token
      const accessToken = prompt('Enter your GitHub Personal Access Token:\n(Create one at: https://github.com/settings/tokens)');
      if (!accessToken) {
        toast.info('GitHub push cancelled - token required');
        return;
      }

      // console.log('📤 Pushing to GitHub...');
      toast.info('Pushing to GitHub...');

      const response = await fetch('/api/github/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: filesToPush,
          repoName,
          description: 'Created with Recoder.xyz',
          isPrivate: false,
          accessToken,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to push to GitHub');
      }

      toast.success(
        <div>
          Successfully pushed to GitHub!
          <br />
          <a href={result.repoUrl} target="_blank" rel="noopener noreferrer" className="underline">
            View Repository
          </a>
        </div>
      );
    } catch (error: any) {
      console.error('❌ GitHub push failed:', error);
      toast.error(`Failed to push to GitHub: ${error.message}`);
    } finally {
      setIsPushing(false);
    }
  }, [files]);

  const handleFilesUpdate = useCallback((newFiles: Record<string, string>) => {
    // console.log('📥 Updating files from GitHub:', Object.keys(newFiles).length, 'files');

    // Convert plain object to workbench format
    const updatedFiles: Record<string, any> = {};
    Object.entries(newFiles).forEach(([path, content]) => {
      updatedFiles[path] = {
        type: 'file',
        content,
        isBinary: false,
      };
    });

    workbenchStore.files.set(updatedFiles);
    workbenchStore.setDocuments(updatedFiles);
    workbenchStore.showWorkbench.set(true);
    toast.success(`Updated ${Object.keys(newFiles).length} files from GitHub`);
  }, []);

  return (
    chatStarted && (
      <motion.div
        initial="closed"
        animate={showWorkbench ? 'open' : 'closed'}
        variants={workbenchVariants}
        className="z-workbench"
      >
        <div
          className={classNames(
            'fixed top-[calc(var(--header-height)+1.5rem)] bottom-6 w-[var(--workbench-inner-width)] mr-4 z-0 transition-[left,width] duration-200 bolt-ease-cubic-bezier',
            {
              'left-[var(--workbench-left)]': showWorkbench && !isFullscreen,
              'left-[100%]': !showWorkbench,
              'left-0 right-0 top-0 bottom-0 w-full mr-0 z-50': isFullscreen,
            },
          )}
        >
          <div className="absolute inset-0 px-6">
            <div className="h-full flex flex-col bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor shadow-sm rounded-lg overflow-hidden">
              <div className="flex items-center px-3 py-2 border-b border-bolt-elements-borderColor">
                <Slider selected={selectedView} options={sliderOptions} setSelected={setSelectedView} />
                <div className="ml-auto" />
                {selectedView === 'code' && (
                  <>
                    <PanelHeaderButton
                      className="mr-1 text-sm"
                      onClick={() => setIsFullscreen(!isFullscreen)}
                      title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                      <div className={isFullscreen ? "i-ph:arrows-in" : "i-ph:arrows-out"} />
                    </PanelHeaderButton>
                    <PanelHeaderButton
                      className="mr-1 text-sm"
                      onClick={() => setShowGitHubModal(true)}
                    >
                      <div className="i-ph:git-branch" />
                      GitHub Sync
                    </PanelHeaderButton>
                    <PanelHeaderButton
                      className="mr-1 text-sm"
                      onClick={handleDownloadCode}
                      disabled={isDownloading || Object.keys(files).length === 0}
                    >
                      <div className={isDownloading ? "i-ph:spinner animate-spin" : "i-ph:download-simple"} />
                      {isDownloading ? 'Downloading...' : 'Download'}
                    </PanelHeaderButton>
                    <PanelHeaderButton
                      className="mr-1 text-sm"
                      onClick={() => {
                        workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get());
                      }}
                    >
                      <div className="i-ph:terminal" />
                      Toggle Terminal
                    </PanelHeaderButton>
                  </>
                )}
                <IconButton
                  icon="i-ph:x-circle"
                  className="-mr-1"
                  size="xl"
                  onClick={() => {
                    workbenchStore.showWorkbench.set(false);
                  }}
                />
              </div>
              <div className="relative flex-1 overflow-hidden">
                <View
                  initial={{ x: selectedView === 'code' ? 0 : '-100%' }}
                  animate={{ x: selectedView === 'code' ? 0 : '-100%' }}
                >
                  <EditorPanel
                    editorDocument={currentDocument}
                    isStreaming={isStreaming}
                    selectedFile={selectedFile}
                    files={files}
                    unsavedFiles={unsavedFiles}
                    onFileSelect={onFileSelect}
                    onEditorScroll={onEditorScroll}
                    onEditorChange={onEditorChange}
                    onFileSave={onFileSave}
                    onFileReset={onFileReset}
                  />
                </View>
                <View
                  initial={{ x: selectedView === 'preview' ? 0 : '100%' }}
                  animate={{ x: selectedView === 'preview' ? 0 : '100%' }}
                >
                  <Preview />
                </View>
              </div>
            </div>
          </div>
        </div>
        <GitHubSyncModal
          isOpen={showGitHubModal}
          onClose={() => setShowGitHubModal(false)}
          files={files}
          onFilesUpdate={handleFilesUpdate}
        />
        {/* ✅ P1: Build Progress Indicator */}
        <BuildProgressIndicator />
      </motion.div>
    )
  );
});

interface ViewProps extends HTMLMotionProps<'div'> {
  children: JSX.Element;
}

const View = memo(({ children, ...props }: ViewProps) => {
  return (
    <motion.div className="absolute inset-0" transition={viewTransition} {...props}>
      {children}
    </motion.div>
  );
});
