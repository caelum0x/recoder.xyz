'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, FileText, Save, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Tab interface matching the battle plan specifications
interface Tab {
  id: string;
  filePath: string;
  fileName: string;
  isDirty: boolean;
  content: string;
  fileType?: string;
}

interface TabManagerProps {
  tabs: Tab[];
  activeTabId: string;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabReorder: (fromIndex: number, toIndex: number) => void;
  onSaveTab?: (tabId: string) => void;
  maxVisibleTabs?: number;
}

// File type to icon mapping
const getFileIcon = (fileName: string): React.ReactNode => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  const iconMap: Record<string, string> = {
    'tsx': '⚛️',
    'jsx': '⚛️', 
    'ts': '🔷',
    'js': '🟨',
    'json': '📄',
    'md': '📝',
    'css': '🎨',
    'html': '🌐',
    'yml': '⚙️',
    'yaml': '⚙️',
    'env': '🔐',
    'gitignore': '🚫'
  };

  return iconMap[extension || ''] || '📄';
};

export default function TabManager({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabReorder,
  onSaveTab,
  maxVisibleTabs = 8
}: TabManagerProps) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  
  // Calculate visible tabs based on scroll position
  const visibleTabs = tabs.slice(scrollPosition, scrollPosition + maxVisibleTabs);
  const hasOverflow = tabs.length > maxVisibleTabs;
  const canScrollLeft = scrollPosition > 0;
  const canScrollRight = scrollPosition + maxVisibleTabs < tabs.length;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Tab / Ctrl+Shift+Tab for tab navigation
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
        if (e.shiftKey) {
          // Previous tab
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
          onTabSelect(tabs[prevIndex].id);
        } else {
          // Next tab
          const nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
          onTabSelect(tabs[nextIndex].id);
        }
      }
      
      // Ctrl+W to close current tab
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) {
          onTabClose(activeTabId);
        }
      }
      
      // Ctrl+S to save current tab
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (activeTabId && onSaveTab) {
          onSaveTab(activeTabId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, onTabSelect, onTabClose, onSaveTab]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const scrollLeft = () => {
    if (canScrollLeft) {
      setScrollPosition(prev => Math.max(0, prev - 1));
    }
  };

  const scrollRight = () => {
    if (canScrollRight) {
      setScrollPosition(prev => Math.min(tabs.length - maxVisibleTabs, prev + 1));
    }
  };

  const handleTabDragStart = (e: React.DragEvent, index: number) => {
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTabDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleTabDragEnd = () => {
    setIsDragging(false);
    setDragOverIndex(null);
  };

  const handleTabDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (dragIndex !== dropIndex) {
      onTabReorder(dragIndex, dropIndex);
    }
    setDragOverIndex(null);
    setIsDragging(false);
  };

  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tabId
    });
  };

  const handleCloseOthers = (exceptTabId: string) => {
    tabs.forEach(tab => {
      if (tab.id !== exceptTabId) {
        onTabClose(tab.id);
      }
    });
    setContextMenu(null);
  };

  const handleCloseAll = () => {
    tabs.forEach(tab => onTabClose(tab.id));
    setContextMenu(null);
  };

  const handleCloseSaved = () => {
    tabs.forEach(tab => {
      if (!tab.isDirty) {
        onTabClose(tab.id);
      }
    });
    setContextMenu(null);
  };

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center border-b bg-gray-50 dark:bg-gray-800 relative">
      {/* Left scroll button */}
      {hasOverflow && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 flex-shrink-0"
          onClick={scrollLeft}
          disabled={!canScrollLeft}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      )}

      {/* Tabs container */}
      <div 
        ref={tabsContainerRef}
        className="flex flex-1 overflow-hidden"
        role="tablist"
      >
        {visibleTabs.map((tab, index) => (
          <div
            key={tab.id}
            role="tab"
            tabIndex={tab.id === activeTabId ? 0 : -1}
            aria-selected={tab.id === activeTabId}
            className={`
              group flex items-center gap-2 px-3 py-2 border-r cursor-pointer 
              select-none min-w-0 flex-shrink-0 max-w-[200px] relative
              ${tab.id === activeTabId 
                ? 'bg-white dark:bg-gray-900 border-t-2 border-t-blue-500' 
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }
              ${dragOverIndex === index ? 'border-l-2 border-l-blue-500' : ''}
              transition-colors duration-200
            `}
            onClick={() => onTabSelect(tab.id)}
            onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
            draggable
            onDragStart={(e) => handleTabDragStart(e, scrollPosition + index)}
            onDragOver={(e) => handleTabDragOver(e, scrollPosition + index)}
            onDragEnd={handleTabDragEnd}
            onDrop={(e) => handleTabDrop(e, scrollPosition + index)}
            title={tab.filePath}
          >
            {/* File type icon */}
            <span className="text-xs flex-shrink-0" role="img" aria-label={`${tab.fileName} file`}>
              {getFileIcon(tab.fileName)}
            </span>
            
            {/* File name */}
            <span className="text-sm truncate flex-1 min-w-0">
              {tab.fileName}
            </span>
            
            {/* Dirty indicator */}
            {tab.isDirty && (
              <div 
                className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" 
                title="Unsaved changes"
                aria-label="Unsaved changes"
              />
            )}
            
            {/* Close button */}
            <Button
              variant="ghost"
              size="sm"
              className="w-4 h-4 p-0 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20 flex-shrink-0 transition-opacity duration-200"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              aria-label={`Close ${tab.fileName}`}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Right scroll button */}
      {hasOverflow && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 flex-shrink-0"
          onClick={scrollRight}
          disabled={!canScrollRight}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="absolute z-50 bg-white dark:bg-gray-800 border rounded shadow-lg py-2 min-w-[160px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <button
            className="w-full px-3 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => handleCloseOthers(contextMenu.tabId)}
          >
            Close Others
          </button>
          <button
            className="w-full px-3 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={handleCloseSaved}
          >
            Close Saved
          </button>
          <button
            className="w-full px-3 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={handleCloseAll}
          >
            Close All
          </button>
          {contextMenu.tabId && onSaveTab && (
            <>
              <hr className="my-1" />
              <button
                className="w-full px-3 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={() => {
                  onSaveTab(contextMenu.tabId);
                  setContextMenu(null);
                }}
              >
                <Save className="w-3 h-3" />
                Save
              </button>
            </>
          )}
        </div>
      )}

      {/* Tab overflow indicator */}
      {hasOverflow && (
        <div className="text-xs text-gray-500 dark:text-gray-400 px-2">
          {scrollPosition + 1}-{Math.min(scrollPosition + maxVisibleTabs, tabs.length)} of {tabs.length}
        </div>
      )}
    </div>
  );
}