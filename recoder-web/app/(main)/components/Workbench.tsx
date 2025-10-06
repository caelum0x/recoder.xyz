'use client';

/**
 * 🚀 Workbench Component - Adapted from bolt.new
 *
 * Provides code editor, preview, and terminal in split-screen layout
 */

import { useState, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useWebContainer, useTerminal } from '@/lib/hooks/useWebContainer';
import dynamic from 'next/dynamic';

// Dynamically import heavy components
const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });
const Preview = dynamic(() => import('./Preview'), { ssr: false });
const Terminal = dynamic(() => import('./Terminal'), { ssr: false });
const FileTree = dynamic(() => import('./FileTree'), { ssr: false });

interface WorkbenchProps {
  files?: Array<{ path: string; content: string }>;
  onFilesChange?: (files: Array<{ path: string; content: string }>) => void;
}

export default function Workbench({ files = [], onFilesChange }: WorkbenchProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [view, setView] = useState<'code' | 'preview' | 'split'>('split');
  const [showTerminal, setShowTerminal] = useState(false);

  const {
    container,
    isBooting,
    isReady,
    error,
    previewUrl,
    writeFiles,
    startDevServer,
  } = useWebContainer();

  const { terminal, attachTerminal } = useTerminal(container);

  // Write files to WebContainer when they change
  useEffect(() => {
    if (isReady && files.length > 0) {
      writeFiles(files).catch(console.error);
    }
  }, [isReady, files, writeFiles]);

  // Get selected file content
  const selectedFileContent = selectedFile
    ? files.find(f => f.path === selectedFile)?.content || ''
    : '';

  const handleFileChange = (path: string, content: string) => {
    const updatedFiles = files.map(f =>
      f.path === path ? { ...f, content } : f
    );
    onFilesChange?.(updatedFiles);
  };

  const handleStartPreview = async () => {
    try {
      await startDevServer();
    } catch (err) {
      console.error('Failed to start dev server:', err);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-bolt-elements-background-depth-1">
        <div className="text-center">
          <div className="text-red-500 mb-2">❌ WebContainer Error</div>
          <div className="text-sm text-bolt-elements-textSecondary">{error.message}</div>
        </div>
      </div>
    );
  }

  if (isBooting) {
    return (
      <div className="flex items-center justify-center h-full bg-bolt-elements-background-depth-1">
        <div className="text-center">
          <div className="text-bolt-elements-textPrimary mb-2">🚀 Booting WebContainer...</div>
          <div className="text-sm text-bolt-elements-textSecondary">Setting up in-browser runtime</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bolt-elements-background-depth-1">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-bolt-elements-background-depth-3 rounded-lg p-1">
            <button
              onClick={() => setView('code')}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                view === 'code'
                  ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
              }`}
            >
              Code
            </button>
            <button
              onClick={() => setView('split')}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                view === 'split'
                  ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
              }`}
            >
              Split
            </button>
            <button
              onClick={() => setView('preview')}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                view === 'preview'
                  ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
              }`}
            >
              Preview
            </button>
          </div>

          {selectedFile && (
            <div className="text-sm text-bolt-elements-textSecondary ml-4">
              {selectedFile}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!previewUrl && isReady && files.length > 0 && (
            <button
              onClick={handleStartPreview}
              className="px-3 py-1 text-sm bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
            >
              Start Preview
            </button>
          )}

          <button
            onClick={() => setShowTerminal(!showTerminal)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              showTerminal
                ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary'
                : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
            }`}
          >
            Terminal
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* File Tree */}
          {view !== 'preview' && (
            <>
              <Panel defaultSize={20} minSize={15} maxSize={30}>
                <FileTree
                  files={files}
                  selectedFile={selectedFile}
                  onFileSelect={setSelectedFile}
                />
              </Panel>
              <PanelResizeHandle className="w-1 bg-bolt-elements-borderColor hover:bg-bolt-elements-borderColorHover transition-colors" />
            </>
          )}

          {/* Code Editor */}
          {(view === 'code' || view === 'split') && (
            <>
              <Panel defaultSize={view === 'split' ? 50 : 80}>
                <CodeEditor
                  value={selectedFileContent}
                  language={selectedFile?.endsWith('.tsx') || selectedFile?.endsWith('.ts') ? 'typescript' : 'javascript'}
                  onChange={(value) => selectedFile && handleFileChange(selectedFile, value)}
                  readOnly={!selectedFile}
                />
              </Panel>
              {view === 'split' && (
                <PanelResizeHandle className="w-1 bg-bolt-elements-borderColor hover:bg-bolt-elements-borderColorHover transition-colors" />
              )}
            </>
          )}

          {/* Preview */}
          {(view === 'preview' || view === 'split') && (
            <Panel defaultSize={view === 'split' ? 50 : 100}>
              <Preview url={previewUrl} />
            </Panel>
          )}
        </PanelGroup>
      </div>

      {/* Terminal (if visible) */}
      {showTerminal && (
        <div className="h-64 border-t border-bolt-elements-borderColor">
          <Terminal attachTerminal={attachTerminal} />
        </div>
      )}
    </div>
  );
}
