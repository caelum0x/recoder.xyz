import { memo, useMemo, useCallback } from 'react';
import {
  CodeMirrorEditor,
  type EditorDocument,
  type EditorSettings,
  type OnChangeCallback as OnEditorChange,
  type OnSaveCallback as OnEditorSave,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import type { FileMap } from '~/lib/stores/files';
import type { Theme } from '~/types/theme';
import { classNames } from '~/utils/classNames';
import { isMobile } from '~/utils/mobile';
import { Breadcrumbs } from './Breadcrumbs';

interface SplitEditorPaneProps {
  // Core props
  theme: Theme;
  editorDocument?: EditorDocument;
  files?: FileMap;
  unsavedFiles?: Set<string>;
  isStreaming?: boolean;
  settings?: EditorSettings;
  projectId?: string;

  // Callbacks
  onEditorChange?: OnEditorChange;
  onEditorScroll?: OnEditorScroll;
  onFileSave?: OnEditorSave;
  onFileReset?: () => void;
  onFileSelect?: (value?: string) => void;
  onGotoDefinition?: (file: string, line: number, character?: number) => void;

  // Pane identification
  paneId: 'primary' | 'secondary';

  // UI state
  showSaveButtons?: boolean;
  autoFocus?: boolean;

  // Optional header actions
  headerActions?: React.ReactNode;

  className?: string;
}

const editorSettings: EditorSettings = { tabSize: 2 };

export const SplitEditorPane = memo(
  ({
    theme,
    editorDocument,
    files,
    unsavedFiles,
    isStreaming,
    settings = editorSettings,
    projectId,
    onEditorChange,
    onEditorScroll,
    onFileSave,
    onFileReset,
    onFileSelect,
    onGotoDefinition,
    paneId,
    showSaveButtons = true,
    autoFocus = true,
    headerActions,
    className,
  }: SplitEditorPaneProps) => {
    const activeFileSegments = useMemo(() => {
      if (!editorDocument) {
        return undefined;
      }
      return editorDocument.filePath.split('/');
    }, [editorDocument]);

    const activeFileUnsaved = useMemo(() => {
      return editorDocument !== undefined && unsavedFiles?.has(editorDocument.filePath);
    }, [editorDocument, unsavedFiles]);

    const handleFileSelect = useCallback((path?: string) => {
      onFileSelect?.(path);
    }, [onFileSelect]);

    return (
      <div className={classNames('flex flex-col h-full overflow-hidden bg-bolt-elements-background-depth-1', className)}>
        <PanelHeader className="overflow-x-auto shrink-0">
          {activeFileSegments?.length ? (
            <div className="flex items-center flex-1 text-sm">
              <Breadcrumbs
                pathSegments={activeFileSegments}
                files={files}
                onFileSelect={handleFileSelect}
                unsavedChanges={activeFileUnsaved}
              />
              <div className="flex items-center gap-1 ml-auto -mr-1.5">
                {headerActions}
                {showSaveButtons && activeFileUnsaved && (
                  <>
                    <PanelHeaderButton onClick={onFileSave} title="Save file">
                      <div className="i-ph:floppy-disk-duotone" />
                      Save
                    </PanelHeaderButton>
                    <PanelHeaderButton onClick={onFileReset} title="Reset changes">
                      <div className="i-ph:clock-counter-clockwise-duotone" />
                      Reset
                    </PanelHeaderButton>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center flex-1 text-sm text-bolt-elements-textTertiary">
              <span className="i-ph:file-dashed mr-2" />
              No file selected
              {headerActions && (
                <div className="flex items-center gap-1 ml-auto -mr-1.5">
                  {headerActions}
                </div>
              )}
            </div>
          )}
        </PanelHeader>
        <div className="h-full flex-1 overflow-hidden">
          <CodeMirrorEditor
            theme={theme}
            editable={!isStreaming && editorDocument !== undefined}
            settings={settings}
            doc={editorDocument}
            autoFocusOnDocumentChange={autoFocus && !isMobile()}
            onScroll={onEditorScroll}
            onChange={onEditorChange}
            onSave={onFileSave}
            onGotoDefinition={onGotoDefinition}
            projectId={projectId}
          />
        </div>
      </div>
    );
  }
);

SplitEditorPane.displayName = 'SplitEditorPane';
