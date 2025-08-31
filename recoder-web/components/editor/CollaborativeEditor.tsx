'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import { io, Socket } from 'socket.io-client';

interface CollaborativeEditorProps {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  projectId: string;
  userId: string;
  userName: string;
  onUserJoin?: (user: CollaboratorInfo) => void;
  onUserLeave?: (userId: string) => void;
}

interface CollaboratorInfo {
  id: string;
  name: string;
  color: string;
  cursor?: monaco.Position;
  selection?: monaco.Range;
  typing: boolean;
}

interface CollaborativeEdit {
  type: 'insert' | 'delete' | 'replace';
  range: monaco.Range;
  text: string;
  userId: string;
  timestamp: number;
}

const COLLABORATOR_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4',
  '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'
];

export default function CollaborativeEditor({
  editor,
  projectId,
  userId,
  userName,
  onUserJoin,
  onUserLeave
}: CollaborativeEditorProps) {
  const socketRef = useRef<Socket | null>(null);
  const [collaborators, setCollaborators] = useState<Map<string, CollaboratorInfo>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const decorationsRef = useRef<Map<string, string[]>>(new Map());
  const isApplyingRemoteChange = useRef(false);
  const lastEditTimestamp = useRef(0);

  // Initialize socket connection
  useEffect(() => {
    if (!editor || !projectId || !userId) return;

    const socket = io('/collaboration', {
      query: { projectId, userId, userName }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to collaboration server');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from collaboration server');
    });

    socket.on('user-joined', (user: CollaboratorInfo) => {
      setCollaborators(prev => new Map(prev).set(user.id, user));
      onUserJoin?.(user);
    });

    socket.on('user-left', (leftUserId: string) => {
      setCollaborators(prev => {
        const newMap = new Map(prev);
        newMap.delete(leftUserId);
        return newMap;
      });
      clearUserDecorations(leftUserId);
      onUserLeave?.(leftUserId);
    });

    socket.on('cursor-moved', ({ userId: remoteUserId, position, selection }: any) => {
      setCollaborators(prev => {
        const newMap = new Map(prev);
        const user = newMap.get(remoteUserId);
        if (user) {
          newMap.set(remoteUserId, { ...user, cursor: position, selection });
          updateUserCursor(user, position, selection);
        }
        return newMap;
      });
    });

    socket.on('text-changed', (edit: CollaborativeEdit) => {
      if (edit.userId !== userId && edit.timestamp > lastEditTimestamp.current) {
        applyRemoteEdit(edit);
      }
    });

    socket.on('user-typing', ({ userId: remoteUserId, typing }: any) => {
      setCollaborators(prev => {
        const newMap = new Map(prev);
        const user = newMap.get(remoteUserId);
        if (user) {
          newMap.set(remoteUserId, { ...user, typing });
        }
        return newMap;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [editor, projectId, userId, userName]);

  // Track cursor movements
  useEffect(() => {
    if (!editor || !socketRef.current) return;

    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      const position = e.position;
      const selection = editor.getSelection();
      
      socketRef.current?.emit('cursor-move', {
        position,
        selection
      });
    });

    const selectionDisposable = editor.onDidChangeCursorSelection((e) => {
      const selection = e.selection;
      
      socketRef.current?.emit('cursor-move', {
        position: e.selection.getStartPosition(),
        selection
      });
    });

    return () => {
      cursorDisposable.dispose();
      selectionDisposable.dispose();
    };
  }, [editor]);

  // Track text changes
  useEffect(() => {
    if (!editor || !socketRef.current) return;

    const changeDisposable = editor.onDidChangeModelContent((e) => {
      if (isApplyingRemoteChange.current) return;

      const timestamp = Date.now();
      lastEditTimestamp.current = timestamp;

      e.changes.forEach((change) => {
        const edit: CollaborativeEdit = {
          type: change.text ? (change.rangeLength > 0 ? 'replace' : 'insert') : 'delete',
          range: monaco.Range.fromPositions(
            { lineNumber: change.range.startLineNumber, column: change.range.startColumn },
            { lineNumber: change.range.endLineNumber, column: change.range.endColumn }
          ),
          text: change.text,
          userId,
          timestamp
        };

        socketRef.current?.emit('text-change', edit);
      });
    });

    // Track typing indicators
    let typingTimer: NodeJS.Timeout;
    const modelChangeDisposable = editor.onDidChangeModelContent(() => {
      if (isApplyingRemoteChange.current) return;

      socketRef.current?.emit('user-typing', { typing: true });
      
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        socketRef.current?.emit('user-typing', { typing: false });
      }, 1000);
    });

    return () => {
      changeDisposable.dispose();
      modelChangeDisposable.dispose();
      clearTimeout(typingTimer);
    };
  }, [editor, userId]);

  // Apply remote edits
  const applyRemoteEdit = (edit: CollaborativeEdit) => {
    if (!editor) return;

    isApplyingRemoteChange.current = true;

    try {
      editor.executeEdits('collaborative-edit', [{
        range: edit.range,
        text: edit.text
      }]);
    } catch (error) {
      console.error('Failed to apply remote edit:', error);
    } finally {
      isApplyingRemoteChange.current = false;
    }
  };

  // Update user cursor visualization
  const updateUserCursor = (user: CollaboratorInfo, position: monaco.Position, selection?: monaco.Range) => {
    if (!editor || !position) return;

    const userId = user.id;
    const existingDecorations = decorationsRef.current.get(userId) || [];

    // Create cursor decoration
    const decorations: monaco.editor.IModelDeltaDecoration[] = [];

    // Cursor line decoration
    decorations.push({
      range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
      options: {
        className: `collaborative-cursor-${userId}`,
        hoverMessage: { value: `${user.name} is here` },
        afterContentClassName: `collaborative-cursor-label-${userId}`
      }
    });

    // Selection decoration
    if (selection && !selection.isEmpty()) {
      decorations.push({
        range: selection,
        options: {
          className: `collaborative-selection-${userId}`,
          hoverMessage: { value: `${user.name}'s selection` }
        }
      });
    }

    const newDecorations = editor.deltaDecorations(existingDecorations, decorations);
    decorationsRef.current.set(userId, newDecorations);

    // Add dynamic styles for this user
    addUserStyles(userId, user.color, user.name);
  };

  // Clear user decorations
  const clearUserDecorations = (userId: string) => {
    if (!editor) return;

    const decorations = decorationsRef.current.get(userId) || [];
    editor.deltaDecorations(decorations, []);
    decorationsRef.current.delete(userId);
    removeUserStyles(userId);
  };

  // Add CSS styles for user
  const addUserStyles = (userId: string, color: string, name: string) => {
    const styleId = `collab-styles-${userId}`;
    const existingStyle = document.getElementById(styleId);
    
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .collaborative-cursor-${userId} {
        border-left: 2px solid ${color};
        position: relative;
      }
      
      .collaborative-cursor-label-${userId}::after {
        content: "${name}";
        position: absolute;
        background: ${color};
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
        top: -20px;
        left: 0;
        z-index: 1000;
        transform: translateX(-50%);
        pointer-events: none;
      }
      
      .collaborative-selection-${userId} {
        background-color: ${color}33;
        border: 1px solid ${color}66;
      }
    `;
    
    document.head.appendChild(style);
  };

  // Remove CSS styles for user
  const removeUserStyles = (userId: string) => {
    const styleId = `collab-styles-${userId}`;
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }
  };

  // Get assigned color for user
  const getUserColor = (userId: string): string => {
    const hash = userId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length];
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear all decorations
      decorationsRef.current.forEach((decorations, userId) => {
        if (editor) {
          editor.deltaDecorations(decorations, []);
        }
        removeUserStyles(userId);
      });
      decorationsRef.current.clear();
    };
  }, [editor]);

  // This component doesn't render anything visible
  return (
    <div className="fixed bottom-4 left-4 z-50">
      {/* Connection status indicator */}
      <div className={`
        px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2
        ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
      `}>
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        {isConnected ? 'Collaborative' : 'Offline'}
      </div>

      {/* Collaborators list */}
      {collaborators.size > 0 && (
        <div className="mt-2 space-y-1">
          {Array.from(collaborators.values()).map((collaborator) => (
            <div
              key={collaborator.id}
              className="flex items-center gap-2 bg-white dark:bg-gray-800 px-2 py-1 rounded shadow"
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: collaborator.color }}
              />
              <span className="text-xs font-medium">{collaborator.name}</span>
              {collaborator.typing && (
                <div className="flex gap-1">
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Hook for easy integration
export const useCollaborativeEditor = (
  editor: monaco.editor.IStandaloneCodeEditor | null,
  projectId: string,
  user: { id: string; name: string }
) => {
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const handleUserJoin = (user: CollaboratorInfo) => {
    setCollaborators(prev => [...prev.filter(u => u.id !== user.id), user]);
  };

  const handleUserLeave = (userId: string) => {
    setCollaborators(prev => prev.filter(u => u.id !== userId));
  };

  return {
    collaborators,
    isConnected,
    collaborativeEditorComponent: (
      <CollaborativeEditor
        editor={editor}
        projectId={projectId}
        userId={user.id}
        userName={user.name}
        onUserJoin={handleUserJoin}
        onUserLeave={handleUserLeave}
      />
    )
  };
};
