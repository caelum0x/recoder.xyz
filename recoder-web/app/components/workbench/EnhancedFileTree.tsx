import { useState, useMemo } from 'react';
import type { FileMap } from '~/lib/stores/files';
import { FileTree } from './FileTree';

// Icon components using UnoCSS classes (Cloudflare Workers compatible)
const Search = ({ className }: { className?: string }) => <div className={`i-ph:magnifying-glass ${className || ''}`} />;
const FolderOpen = ({ className }: { className?: string }) => <div className={`i-ph:folder-open ${className || ''}`} />;
const File = ({ className }: { className?: string }) => <div className={`i-ph:file ${className || ''}`} />;
const ChevronRight = ({ className }: { className?: string }) => <div className={`i-ph:caret-right ${className || ''}`} />;
const ChevronDown = ({ className }: { className?: string }) => <div className={`i-ph:caret-down ${className || ''}`} />;
const X = ({ className }: { className?: string }) => <div className={`i-ph:x ${className || ''}`} />;

interface EnhancedFileTreeProps {
  files: FileMap;
  selectedFile?: string;
  onFileSelect?: (filePath: string) => void;
  onFileCreate?: (folderPath: string, fileName: string) => void;
  onFolderCreate?: (folderPath: string, folderName: string) => void;
  onFileDelete?: (filePath: string) => void;
  onFileRename?: (oldPath: string, newPath: string) => void;
  onFileCopy?: (filePath: string) => void;
  rootFolder?: string;
  hideRoot?: boolean;
  collapsed?: boolean;
  allowFolderSelection?: boolean;
  hiddenFiles?: Array<string | RegExp>;
  unsavedFiles?: Set<string>;
  className?: string;
}

// File extension to icon/color mapping
const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  ts: { icon: '󰛦', color: 'text-blue-400' },
  tsx: { icon: '󰜈', color: 'text-blue-500' },
  js: { icon: '󰌞', color: 'text-yellow-400' },
  jsx: { icon: '󰜈', color: 'text-yellow-500' },
  json: { icon: '󰘦', color: 'text-yellow-300' },
  md: { icon: '󰍔', color: 'text-gray-400' },
  css: { icon: '󰌜', color: 'text-blue-300' },
  scss: { icon: '󰌜', color: 'text-pink-400' },
  html: { icon: '󰌝', color: 'text-orange-400' },
  py: { icon: '󰌠', color: 'text-yellow-400' },
  rs: { icon: '󱘗', color: 'text-orange-500' },
  go: { icon: '󰟓', color: 'text-cyan-400' },
  sql: { icon: '󰆼', color: 'text-blue-300' },
  prisma: { icon: '󰆼', color: 'text-teal-400' },
  env: { icon: '󰈙', color: 'text-yellow-500' },
  yaml: { icon: '󰈙', color: 'text-red-400' },
  yml: { icon: '󰈙', color: 'text-red-400' },
  lock: { icon: '󰌾', color: 'text-gray-500' },
  gitignore: { icon: '󰊢', color: 'text-orange-400' },
};

export function EnhancedFileTree({
  files,
  selectedFile,
  onFileSelect,
  onFileCreate,
  onFolderCreate,
  onFileDelete,
  onFileRename,
  onFileCopy,
  rootFolder,
  hideRoot = true,
  collapsed,
  allowFolderSelection,
  hiddenFiles,
  unsavedFiles,
  className,
}: EnhancedFileTreeProps) {
  // Search functionality moved to dedicated Search tab
  const searchQuery = '';  // Keep for filtering compatibility

  const fileStats = useMemo(() => {
    const paths = Object.keys(files);
    const folders = new Set(paths.map(p => p.split('/').slice(0, -1).join('/')).filter(Boolean));
    return {
      files: paths.length,
      folders: folders.size,
    };
  }, [files]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    
    const query = searchQuery.toLowerCase();
    const filtered: FileMap = {};
    
    Object.entries(files).forEach(([path, content]) => {
      if (path.toLowerCase().includes(query)) {
        filtered[path] = content;
      }
    });
    
    return filtered;
  }, [files, searchQuery]);


  return (
    <div className={`h-full flex flex-col ${className || ''}`}>
      {/* Header with stats */}
      <div className="p-2 border-b border-bolt-elements-borderColor flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
          <span className="flex items-center gap-1">
            <File className="w-3 h-3" />
            {fileStats.files}
          </span>
          <span className="flex items-center gap-1">
            <FolderOpen className="w-3 h-3" />
            {fileStats.folders}
          </span>
        </div>
        {/* Search button removed - use the dedicated Search tab instead */}
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto">
        <FileTree
          files={filteredFiles}
          selectedFile={selectedFile}
          onFileSelect={onFileSelect}
          onFileCreate={onFileCreate}
          onFolderCreate={onFolderCreate}
          onFileDelete={onFileDelete}
          onFileRename={onFileRename}
          onFileCopy={onFileCopy}
          rootFolder={rootFolder}
          hideRoot={hideRoot}
          collapsed={collapsed}
          allowFolderSelection={allowFolderSelection}
          hiddenFiles={hiddenFiles}
          unsavedFiles={unsavedFiles}
          className={className}
        />
      </div>
    </div>
  );
}
