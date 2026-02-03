/**
 * EnhancedHistoryItem - History item with inline rename, export, and favorite support
 */

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from '@remix-run/react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatSessionMetadata } from '~/lib/stores/chat-sessions';
import { renameSessionPersistent, exportConversation } from '~/lib/persistence/useChatHistory';
import { toggleFavorite, startRenaming, stopRenaming, renamingSessionId } from '~/lib/stores/chat-sessions';
import { useStore } from '@nanostores/react';

interface EnhancedHistoryItemProps {
  session: ChatSessionMetadata;
  onDelete?: (event: React.UIEvent) => void;
}

export function EnhancedHistoryItem({ session, onDelete }: EnhancedHistoryItemProps) {
  const [hovering, setHovering] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const renamingId = useStore(renamingSessionId);
  const isRenaming = renamingId === session.id;
  const hoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;

    function mouseEnter() {
      setHovering(true);

      if (timeout) {
        clearTimeout(timeout);
      }
    }

    function mouseLeave() {
      setHovering(false);
    }

    hoverRef.current?.addEventListener('mouseenter', mouseEnter);
    hoverRef.current?.addEventListener('mouseleave', mouseLeave);

    return () => {
      hoverRef.current?.removeEventListener('mouseenter', mouseEnter);
      hoverRef.current?.removeEventListener('mouseleave', mouseLeave);
    };
  }, []);

  // Focus input when renaming starts
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  // Reset edit title when session changes
  useEffect(() => {
    setEditTitle(session.title);
  }, [session.title]);

  const handleRenameSubmit = useCallback(async () => {
    if (editTitle.trim() && editTitle !== session.title) {
      await renameSessionPersistent(session.id, editTitle.trim());
    }
    stopRenaming();
  }, [session.id, session.title, editTitle]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setEditTitle(session.title);
      stopRenaming();
    }
  }, [handleRenameSubmit, session.title]);

  const handleExport = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await exportConversation(session.id);
  }, [session.id]);

  const handleToggleFavorite = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(session.id);
  }, [session.id]);

  const handleStartRename = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startRenaming(session.id);
  }, [session.id]);

  return (
    <div
      ref={hoverRef}
      className="group rounded-md text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2 overflow-hidden flex justify-between items-center px-2 py-1"
    >
      {/* Favorite indicator */}
      <button
        onClick={handleToggleFavorite}
        className={`flex-shrink-0 mr-2 transition-colors ${
          session.isFavorite
            ? 'i-ph:star-fill text-yellow-400'
            : 'i-ph:star text-bolt-elements-textTertiary hover:text-yellow-400 opacity-0 group-hover:opacity-100'
        }`}
        title={session.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      />

      {isRenaming ? (
        <input
          ref={inputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={handleKeyDown}
          className="flex-1 px-2 py-0.5 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <Link to={`/chat/${session.urlId}`} className="flex-1 relative truncate block">
          <span className="flex items-center gap-1">
            {session.title}
            {session.source === 'cli' && (
              <span className="text-[10px] px-1 py-0.5 bg-bolt-elements-background-depth-2 rounded text-bolt-elements-textTertiary">
                CLI
              </span>
            )}
          </span>

          {/* Gradient fade for long titles */}
          <div className="absolute right-0 z-1 top-0 bottom-0 bg-gradient-to-l from-bolt-elements-background-depth-2 group-hover:from-bolt-elements-background-depth-3 to-transparent w-10 flex justify-end group-hover:w-20 group-hover:from-45% pointer-events-none">
            <AnimatePresence>
              {hovering && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-0.5 pr-1 pointer-events-auto"
                >
                  {/* Rename button */}
                  <button
                    className="p-1 i-ph:pencil scale-90 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
                    onClick={handleStartRename}
                    title="Rename"
                  />

                  {/* Export button */}
                  <button
                    className="p-1 i-ph:download scale-90 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
                    onClick={handleExport}
                    title="Export as Markdown"
                  />

                  {/* Delete button */}
                  <Dialog.Trigger asChild>
                    <button
                      className="p-1 i-ph:trash scale-90 text-bolt-elements-textTertiary hover:text-red-400"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDelete?.(event);
                      }}
                      title="Delete"
                    />
                  </Dialog.Trigger>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Link>
      )}
    </div>
  );
}

export default EnhancedHistoryItem;
