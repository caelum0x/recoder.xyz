'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Users, Share2, Cpu, Sparkles } from 'lucide-react';

interface CollaborativeUser {
  id: string;
  name: string;
  email: string;
  color: string;
  cursor?: {
    line: number;
    column: number;
  };
  status: 'active' | 'idle' | 'away';
}

interface CollaborativeEditorProps {
  sessionId?: string;
  userId: string;
  userName: string;
  userEmail: string;
  initialCode?: string;
  language?: string;
  onCodeChange?: (code: string) => void;
  onAIRequest?: (prompt: string) => Promise<string>;
}

export function CollaborativeEditor({
  sessionId,
  userId,
  userName,
  userEmail,
  initialCode = '',
  language = 'typescript',
  onCodeChange,
  onAIRequest
}: CollaborativeEditorProps) {
  const [code, setCode] = useState(initialCode);
  const [participants, setParticipants] = useState<CollaborativeUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [aiGenerations, setAiGenerations] = useState<any[]>([]);
  const [showCollabPanel, setShowCollabPanel] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  
  const initializeSession = useCallback(async () => {
    if (!sessionId) {
      try {
        const response = await fetch('/api/collaboration/websocket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_session',
            userId,
            data: {
              name: `${userName}'s Coding Session`,
              description: 'Real-time collaborative coding',
              projectId: `project_${Date.now()}`,
              isPublic: false
            }
          })
        });
        
        const result = await response.json();
        if (result.success) {
          console.log('Created session:', result.sessionId);
        }
      } catch (error) {
        console.error('Failed to create session:', error);
      }
    } else {
      try {
        const response = await fetch('/api/collaboration/websocket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'join_session',
            sessionId,
            userId,
            data: {
              name: userName,
              email: userEmail
            }
          })
        });
        
        const result = await response.json();
        if (result.success) {
          setParticipants(result.session.participants);
          setIsConnected(true);
          console.log('Joined session:', sessionId);
        }
      } catch (error) {
        console.error('Failed to join session:', error);
      }
    }
  }, [sessionId, userId, userName, userEmail]);

  const handleCodeChange = useCallback(async (newCode: string) => {
    setCode(newCode);
    onCodeChange?.(newCode);
    
    if (sessionId && isConnected) {
      try {
        await fetch('/api/collaboration/websocket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'apply_change',
            sessionId,
            userId,
            data: {
              type: 'replace',
              position: {
                start: { line: 0, column: 0 },
                end: { line: 999, column: 999 }
              },
              content: newCode,
              metadata: {
                aiGenerated: false
              }
            }
          })
        });
      } catch (error) {
        console.error('Failed to sync change:', error);
      }
    }
  }, [sessionId, userId, isConnected, onCodeChange]);

  const handleAIGeneration = useCallback(async () => {
    if (!onAIRequest) return;
    
    const prompt = `Improve this ${language} code:\n\n${code}`;
    
    try {
      const aiResponse = await onAIRequest(prompt);
      
      const enhancedCode = aiResponse;
      setCode(enhancedCode);
      onCodeChange?.(enhancedCode);
      
      if (sessionId && isConnected) {
        await fetch('/api/collaboration/websocket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'share_ai_generation',
            sessionId,
            userId,
            data: {
              prompt,
              response: aiResponse,
              model: 'local-chat-model',
              provider: 'ollama'
            }
          })
        });
        
        setAiGenerations(prev => [{
          id: Date.now(),
          user: userName,
          prompt,
          response: aiResponse,
          timestamp: Date.now()
        }, ...prev]);
      }
    } catch (error) {
      console.error('AI generation failed:', error);
    }
  }, [code, language, onAIRequest, sessionId, userId, isConnected, userName, onCodeChange]);

  const handleCursorChange = useCallback(async () => {
    if (!editorRef.current || !sessionId || !isConnected) return;
    
    const textarea = editorRef.current;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = textarea.value.substring(0, cursorPos);
    const lines = textBeforeCursor.split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length;
    
    try {
      await fetch('/api/collaboration/websocket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_cursor',
          sessionId,
          userId,
          data: {
            cursor: { line, column }
          }
        })
      });
    } catch (error) {
      console.error('Failed to update cursor:', error);
    }
  }, [sessionId, userId, isConnected]);

  useEffect(() => {
    initializeSession();
    
    return () => {
      if (sessionId && isConnected) {
        fetch('/api/collaboration/websocket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'leave_session',
            sessionId,
            userId
          })
        }).catch(console.error);
      }
    };
  }, [initializeSession, sessionId, userId, isConnected]);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-blue-500" />
            <span className="font-semibold">
              {sessionId ? 'Collaborative Session' : 'Solo Session'}
            </span>
            {isConnected && (
              <Badge variant="outline" className="bg-green-50 text-green-700">
                Connected
              </Badge>
            )}
          </div>
          
          <div className="flex -space-x-2">
            {participants.slice(0, 5).map((participant) => (
              <div
                key={participant.id}
                className="h-8 w-8 border-2 border-white rounded-full flex items-center justify-center text-white text-xs font-semibold"
                style={{ backgroundColor: participant.color, borderColor: participant.color }}
              >
                {participant.name.charAt(0).toUpperCase()}
              </div>
            ))}
            {participants.length > 5 && (
              <Badge variant="secondary" className="ml-2">
                +{participants.length - 5}
              </Badge>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCollabPanel(!showCollabPanel)}
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleAIGeneration}
            disabled={!onAIRequest}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            AI Enhance
          </Button>
        </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="flex-1 p-4">
            <textarea
              ref={editorRef}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              onSelect={handleCursorChange}
              onKeyUp={handleCursorChange}
              onClick={handleCursorChange}
              placeholder={`Start typing ${language} code...`}
              className="w-full h-full p-4 font-mono text-sm border rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ minHeight: '400px', resize: 'none' }}
            />
          </div>
          
          {participants.length > 1 && (
            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-t">
              <div className="flex items-center space-x-2 text-sm text-blue-700 dark:text-blue-300">
                <Cpu className="h-4 w-4" />
                <span>
                  {participants.length} people are collaborating on this code
                </span>
              </div>
            </div>
          )}
        </div>
        
        {showCollabPanel && (
          <Card className="w-80 m-4 p-4 bg-white dark:bg-gray-800">
            <h3 className="font-semibold mb-4 flex items-center">
              <Users className="h-4 w-4 mr-2" />
              Collaboration
            </h3>
            
            <div className="space-y-2 mb-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Participants ({participants.length})
              </h4>
              {participants.map((participant) => (
                <div key={participant.id} className="flex items-center space-x-2">
                  <div 
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: participant.color }}
                  />
                  <span className="text-sm">{participant.name}</span>
                  <Badge 
                    variant={participant.status === 'active' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {participant.status}
                  </Badge>
                </div>
              ))}
            </div>
            
            {aiGenerations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  AI Generations
                </h4>
                <div className="max-h-32 overflow-y-auto space-y-2">
                  {aiGenerations.map((generation) => (
                    <div key={generation.id} className="text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded">
                      <div className="font-semibold">{generation.user}</div>
                      <div className="text-gray-600 dark:text-gray-400 truncate">
                        {generation.prompt}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}