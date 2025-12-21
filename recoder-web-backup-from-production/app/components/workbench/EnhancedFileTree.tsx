import { useState, useMemo } from 'react';
import { Search, FolderOpen, File, ChevronRight, ChevronDown, X } from 'lucide-react';
import type { FileMap } from '~/lib/stores/files';
import { FileTree } from './FileTree';

interface EnhancedFileTreeProps {
  files: FileMap;
  selectedFile?: string;
  onFileSelect?: (filePath: string) => void;
  unsavedFiles?: Set<string>;
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

export function EnhancedFileTree({ files, selectedFile, onFileSelect, unsavedFiles }: EnhancedFileTreeProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

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

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    return Object.keys(files)
      .filter(path => path.toLowerCase().includes(query))
      .slice(0, 10);
  }, [files, searchQuery]);

  return (
    <div className="h-full flex flex-col">
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
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="p-1 hover:bg-bolt-elements-background-depth-2 rounded"
        >
          <Search className="w-4 h-4 text-bolt-elements-textSecondary" />
        </button>
      </div>

      {/* Search input */}
      {showSearch && (
        <div className="p-2 border-b border-bolt-elements-borderColor">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-bolt-elements-textSecondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-8 pr-8 py-1.5 text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded focus:outline-none focus:border-bolt-elements-focus"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary" />
              </button>
            )}
          </div>
          
          {/* Quick search results */}
          {searchQuery && searchResults.length > 0 && (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {searchResults.map((path) => {
                const fileName = path.split('/').pop() || '';
                const ext = fileName.split('.').pop() || '';
                const iconInfo = FILE_ICONS[ext] || { icon: '󰈔', color: 'text-gray-400' };
                
                return (
                  <button
                    key={path}
                    onClick={() => {
                      onFileSelect?.(path);
                      setSearchQuery('');
                      setShowSearch(false);
                    }}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-bolt-elements-background-depth-2 rounded flex items-center gap-2"
                  >
                    <span className={iconInfo.color}>{iconInfo.icon}</span>
                    <span className="truncate flex-1">{path}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto">
        <FileTree
          files={filteredFiles}
          selectedFile={selectedFile}
          onFileSelect={onFileSelect}
          unsavedFiles={unsavedFiles}
          hideRoot
        />
      </div>
    </div>
  );
}
