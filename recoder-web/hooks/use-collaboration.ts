import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  cursor?: { line: number; column: number };
  selection?: { start: number; end: number };
  color: string;
  typing?: boolean;
}

interface UseCollaborationProps {
  projectId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  onTextUpdate?: (changes: any, version: number) => void;
  onFileUpdate?: (filePath: string, content: string, version: number) => void;
}

export const useCollaboration = ({ 
  projectId, 
  user, 
  onTextUpdate, 
  onFileUpdate 
}: UseCollaborationProps) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [collaborators, setCollaborators] = useState<CollaborationUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io({
      path: '/api/socket',
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      setSocket(newSocket);
      
      // Join the project room
      newSocket.emit('join-project', { projectId, user });
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Handle collaboration events
    newSocket.on('user-joined', ({ user: newUser, socketId }) => {
      setCollaborators(prev => {
        const exists = prev.find(c => c.id === newUser.id);
        if (!exists) {
          return [...prev, { ...newUser, socketId }];
        }
        return prev;
      });
    });

    newSocket.on('user-left', ({ userId, socketId }) => {
      setCollaborators(prev => prev.filter(c => c.id !== userId));
    });

    newSocket.on('room-users', (users) => {
      setCollaborators(users.filter((u: any) => u.id !== user.id));
    });

    newSocket.on('cursor-update', ({ userId, socketId, cursor, color }) => {
      setCollaborators(prev => prev.map(c => 
        c.id === userId ? { ...c, cursor, color } : c
      ));
    });

    newSocket.on('selection-update', ({ userId, socketId, selection, color }) => {
      setCollaborators(prev => prev.map(c => 
        c.id === userId ? { ...c, selection, color } : c
      ));
    });

    newSocket.on('text-update', ({ userId, socketId, changes, version }) => {
      if (onTextUpdate && userId !== user.id) {
        onTextUpdate(changes, version);
      }
    });

    newSocket.on('file-update', ({ filePath, content, version }) => {
      if (onFileUpdate) {
        onFileUpdate(filePath, content, version);
      }
    });

    newSocket.on('user-typing', ({ userId, socketId, typing }) => {
      setCollaborators(prev => prev.map(c => 
        c.id === userId ? { ...c, typing } : c
      ));
    });

    return () => {
      newSocket.disconnect();
    };
  }, [projectId, user.id, user.name, user.email, onTextUpdate, onFileUpdate]);

  const sendCursorMove = (cursor: { line: number; column: number }) => {
    if (socket && isConnected) {
      socket.emit('cursor-move', { projectId, cursor });
    }
  };

  const sendTextChange = (changes: any, version: number) => {
    if (socket && isConnected) {
      socket.emit('text-change', { projectId, changes, version });
    }
  };

  const sendSelectionChange = (selection: { start: number; end: number }) => {
    if (socket && isConnected) {
      socket.emit('selection-change', { projectId, selection });
    }
  };

  const sendFileChange = (filePath: string, content: string, version: number) => {
    if (socket && isConnected) {
      socket.emit('file-change', { projectId, filePath, content, version });
    }
  };

  const startTyping = () => {
    if (socket && isConnected) {
      socket.emit('typing-start', { projectId });
    }
  };

  const stopTyping = () => {
    if (socket && isConnected) {
      socket.emit('typing-stop', { projectId });
    }
  };

  return {
    collaborators,
    isConnected,
    sendCursorMove,
    sendTextChange,
    sendSelectionChange,
    sendFileChange,
    startTyping,
    stopTyping
  };
};
