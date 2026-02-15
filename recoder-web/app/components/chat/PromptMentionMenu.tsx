/**
 * PromptMentionMenu — Popup that appears when user types @ in chat input.
 *
 * Supports multiple mention types:
 * - @file:<path>   — Insert file contents into context
 * - @folder:<path> — Insert folder listing into context
 * - @symbol:<name> — Insert symbol definition into context
 * - @prompt:<id>   — Insert a saved prompt
 *
 * Typing @f filters to files, @p filters to prompts, etc.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { dockerGet } from '~/lib/services/docker-api';

// ========== Types ==========

type MentionType = 'file' | 'folder' | 'symbol' | 'prompt';

interface MentionItem {
  type: MentionType;
  id: string;
  label: string;
  description?: string;
}

interface PromptMentionMenuProps {
  filter: string;
  projectId?: string;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
  position?: 'above' | 'below';
}

// ========== Mention type config ==========

const MENTION_TYPES: Record<MentionType, { label: string; icon: string; color: string; prefix: string }> = {
  file:   { label: '@file',   icon: 'i-ph:file-text', color: 'bg-blue-500/20 text-blue-400', prefix: 'file' },
  folder: { label: '@folder', icon: 'i-ph:folder',    color: 'bg-amber-500/20 text-amber-400', prefix: 'folder' },
  symbol: { label: '@symbol', icon: 'i-ph:code',      color: 'bg-green-500/20 text-green-400', prefix: 'symbol' },
  prompt: { label: '@prompt', icon: 'i-ph:chat-text',  color: 'bg-purple-500/20 text-purple-400', prefix: 'prompt' },
};

// ========== Component ==========

export function PromptMentionMenu({ filter, projectId, onSelect, onClose, position = 'above' }: PromptMentionMenuProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<MentionItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch file tree + prompts on mount
  useEffect(() => {
    // Fetch file tree from Docker backend
    if (projectId) {
      dockerGet<{ files?: string[]; entries?: Array<{ path: string }> }>(`/api/files?projectId=${projectId}`)
        .then((data) => {
          const paths = data.files || data.entries?.map(e => e.path) || [];
          setFiles(paths);
        })
        .catch(() => setFiles([]));
    }

    // Fetch prompts
    dockerGet<{ prompts: Array<{ id: string; title: string; description: string }> }>('/api/prompts')
      .then((data) => {
        setPrompts(
          (data.prompts || []).map((p) => ({
            type: 'prompt' as MentionType,
            id: p.id,
            label: p.title,
            description: p.description,
          })),
        );
      })
      .catch(() => setPrompts([]));
  }, [projectId]);

  // Build all mention items and filter them
  const items = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    const allItems: MentionItem[] = [];

    // Determine if user is filtering by type prefix (e.g., @file:, @f)
    let typeFilter: MentionType | null = null;
    let nameFilter = lowerFilter;

    for (const [type, config] of Object.entries(MENTION_TYPES)) {
      if (lowerFilter.startsWith(`${config.prefix}:`)) {
        typeFilter = type as MentionType;
        nameFilter = lowerFilter.slice(config.prefix.length + 1);
        break;
      } else if (lowerFilter.startsWith(`${config.prefix.charAt(0)}`) && lowerFilter.length <= 2) {
        // Short prefix match: @f -> file, @p -> prompt, @s -> symbol, @fo -> folder
        if (config.prefix.startsWith(lowerFilter)) {
          typeFilter = type as MentionType;
          nameFilter = '';
        }
      }
    }

    // File items
    if (!typeFilter || typeFilter === 'file') {
      const matchedFiles = files
        .filter((f) => {
          if (!nameFilter) return true;
          const fileName = f.split('/').pop() || f;
          return fileName.toLowerCase().includes(nameFilter) || f.toLowerCase().includes(nameFilter);
        })
        .slice(0, 15);

      for (const f of matchedFiles) {
        allItems.push({
          type: 'file',
          id: f,
          label: f.split('/').pop() || f,
          description: f,
        });
      }
    }

    // Folder items (extract unique directories from files)
    if (!typeFilter || typeFilter === 'folder') {
      const dirs = new Set<string>();

      for (const f of files) {
        const parts = f.split('/');
        let current = '';

        for (let i = 0; i < parts.length - 1; i++) {
          current = current ? `${current}/${parts[i]}` : parts[i];
          dirs.add(current);
        }
      }

      const matchedDirs = Array.from(dirs)
        .filter((d) => {
          if (!nameFilter) return true;
          return d.toLowerCase().includes(nameFilter);
        })
        .slice(0, 10);

      for (const d of matchedDirs) {
        allItems.push({
          type: 'folder',
          id: d,
          label: d.split('/').pop() || d,
          description: d,
        });
      }
    }

    // Symbol items (extract from file names as a heuristic - components, hooks, utils)
    if (!typeFilter || typeFilter === 'symbol') {
      const symbols: MentionItem[] = [];

      for (const f of files) {
        const fileName = f.split('/').pop() || '';
        const baseName = fileName.replace(/\.(tsx?|jsx?|vue|svelte)$/, '');

        if (baseName && !baseName.startsWith('.') && !baseName.startsWith('_')) {
          // Extract likely symbol names from file names
          if (
            nameFilter === '' ||
            baseName.toLowerCase().includes(nameFilter)
          ) {
            symbols.push({
              type: 'symbol',
              id: f,
              label: baseName,
              description: f,
            });
          }
        }
      }

      allItems.push(...symbols.slice(0, 10));
    }

    // Prompt items
    if (!typeFilter || typeFilter === 'prompt') {
      const matchedPrompts = prompts.filter((p) => {
        if (!nameFilter) return true;
        return p.label.toLowerCase().includes(nameFilter);
      });
      allItems.push(...matchedPrompts);
    }

    return allItems;
  }, [filter, files, prompts]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Handle keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (items.length > 0) {
          e.preventDefault();
          onSelect(items[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [items, selectedIndex, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const menu = menuRef.current;

    if (!menu) return;

    const selected = menu.querySelector(`[data-idx="${selectedIndex}"]`);
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (items.length === 0) {
    return (
      <div
        ref={menuRef}
        className={`absolute ${position === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'} left-4 right-4 z-50 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-lg overflow-hidden`}
      >
        <div className="px-3 py-2 text-xs text-bolt-elements-textTertiary">
          {filter ? `No matches for "@${filter}"` : 'Type to search files, folders, symbols, or prompts'}
        </div>
        <div className="px-3 pb-2 flex gap-1 flex-wrap">
          {Object.entries(MENTION_TYPES).map(([, config]) => (
            <span key={config.prefix} className={`text-[10px] px-1.5 py-0.5 ${config.color} rounded font-mono`}>
              @{config.prefix}:
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Group items by type for section headers
  let lastType: MentionType | null = null;

  return (
    <div
      ref={menuRef}
      className={`absolute ${position === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'} left-4 right-4 z-50 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-lg overflow-hidden`}
    >
      <div className="px-3 py-1.5 border-b border-bolt-elements-borderColor/50 flex items-center gap-2">
        <span className="text-[10px] text-bolt-elements-textSecondary font-medium uppercase tracking-wider">
          Insert Reference
        </span>
        <div className="flex gap-1 ml-auto">
          {Object.entries(MENTION_TYPES).map(([, config]) => (
            <span key={config.prefix} className={`text-[9px] px-1 py-0.5 ${config.color} rounded font-mono`}>
              @{config.prefix}
            </span>
          ))}
        </div>
      </div>
      <div className="max-h-64 overflow-auto py-1">
        {items.map((item, idx) => {
          const config = MENTION_TYPES[item.type];
          const showHeader = item.type !== lastType;
          lastType = item.type;

          return (
            <div key={`${item.type}-${item.id}`}>
              {showHeader && (
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[9px] text-bolt-elements-textTertiary font-medium uppercase tracking-wider">
                    {item.type === 'file' ? 'Files' : item.type === 'folder' ? 'Folders' : item.type === 'symbol' ? 'Symbols' : 'Prompts'}
                  </span>
                </div>
              )}
              <button
                data-idx={idx}
                onClick={() => onSelect(item)}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                  idx === selectedIndex
                    ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                    : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-1'
                }`}
              >
                <span className={`${config.icon} text-sm shrink-0`} />
                <span className={`text-[10px] px-1 py-0.5 ${config.color} rounded font-mono shrink-0`}>
                  @{config.prefix}
                </span>
                <span className="text-xs font-medium truncate">{item.label}</span>
                {item.description && item.description !== item.label && (
                  <span className="text-[10px] text-bolt-elements-textTertiary truncate ml-auto">
                    {item.description}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
