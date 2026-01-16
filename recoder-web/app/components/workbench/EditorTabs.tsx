import { memo, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

interface EditorTabsProps {
  unsavedFiles?: Set<string>;
}

export const EditorTabs = memo(({ unsavedFiles }: EditorTabsProps) => {
  const openTabs = useStore(workbenchStore.openTabs);
  const selectedFile = useStore(workbenchStore.selectedFile);

  const handleTabClick = useCallback((filePath: string) => {
    workbenchStore.setSelectedFile(filePath);
  }, []);

  const handleTabClose = useCallback((e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    workbenchStore.closeTab(filePath);
  }, []);

  const handleMiddleClick = useCallback((e: React.MouseEvent, filePath: string) => {
    if (e.button === 1) {
      e.preventDefault();
      workbenchStore.closeTab(filePath);
    }
  }, []);

  if (openTabs.length === 0) return null;

  return (
    <div className="flex items-center bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor overflow-x-auto">
      {openTabs.map((filePath) => {
        const fileName = filePath.split('/').pop() || filePath;
        const isActive = filePath === selectedFile;
        const isUnsaved = unsavedFiles?.has(filePath);

        return (
          <div
            key={filePath}
            onClick={() => handleTabClick(filePath)}
            onMouseDown={(e) => handleMiddleClick(e, filePath)}
            className={classNames(
              'group flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer border-r border-bolt-elements-borderColor',
              'hover:bg-bolt-elements-background-depth-3 transition-colors',
              {
                'bg-bolt-elements-background-depth-1 text-white': isActive,
                'text-gray-400': !isActive,
              }
            )}
            title={filePath}
          >
            <span className="truncate max-w-[120px]">{fileName}</span>
            {isUnsaved && (
              <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />
            )}
            <button
              onClick={(e) => handleTabClose(e, filePath)}
              className={classNames(
                'flex items-center justify-center w-4 h-4 bg-transparent border-none hover:text-white transition-colors',
                'opacity-0 group-hover:opacity-100',
                { 'opacity-100': isActive }
              )}
            >
              <div className="i-ph:x text-xs" />
            </button>
          </div>
        );
      })}
    </div>
  );
});

EditorTabs.displayName = 'EditorTabs';
