import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useAuthContext } from './AuthContext';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  metadata?: {
    model?: string;
    tokens?: number;
    cost?: number;
    reasoning?: any;
  };
}

interface Chat {
  id: string;
  title?: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
  model?: string;
  agent?: string;
}

interface ChatContextType {
  chats: Chat[];
  currentChat: Chat | null;
  loading: boolean;
  createNewChat: () => Promise<Chat | null>;
  loadChat: (chatId: string) => Promise<void>;
  sendMessage: (content: string, chatId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  updateChatTitle: (chatId: string, title: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const API_BASE_URL = 'http://localhost:3001'; // Recoder Chat Platform

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [loading, setLoading] = useState(false);
  const { user, isAuthenticated } = useAuthContext();

  useEffect(() => {
    if (isAuthenticated) {
      loadChats();
    } else {
      // Clear chats when logged out
      setChats([]);
      setCurrentChat(null);
    }
  }, [isAuthenticated]);

  const loadChats = async () => {
    try {
      setLoading(true);

      // First, try to load from server
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        const response = await fetch(`${API_BASE_URL}/api/history`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const serverChats = await response.json();
          setChats(serverChats);
          
          // Save to local storage for offline access
          await AsyncStorage.setItem('chats', JSON.stringify(serverChats));
          return;
        }
      }

      // Fallback to local storage
      const localChats = await AsyncStorage.getItem('chats');
      if (localChats) {
        setChats(JSON.parse(localChats));
      }
    } catch (error) {
      console.error('Error loading chats:', error);
      
      // Try local storage as fallback
      try {
        const localChats = await AsyncStorage.getItem('chats');
        if (localChats) {
          setChats(JSON.parse(localChats));
        }
      } catch (localError) {
        console.error('Error loading local chats:', localError);
      }
    } finally {
      setLoading(false);
    }
  };

  const createNewChat = async (): Promise<Chat | null> => {
    try {
      const newChat: Chat = {
        id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: 'New Chat',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Update local state
      const updatedChats = [newChat, ...chats];
      setChats(updatedChats);
      setCurrentChat(newChat);

      // Save locally
      await AsyncStorage.setItem('chats', JSON.stringify(updatedChats));

      // Sync with server if authenticated
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        try {
          await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: newChat.id,
              title: newChat.title,
            }),
          });
        } catch (error) {
          console.error('Error syncing new chat with server:', error);
          // Continue anyway - local functionality is preserved
        }
      }

      return newChat;
    } catch (error) {
      console.error('Error creating new chat:', error);
      return null;
    }
  };

  const loadChat = async (chatId: string) => {
    try {
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        setCurrentChat(chat);
        
        // Load full chat history from server if authenticated
        const token = await SecureStore.getItemAsync('auth_token');
        if (token) {
          try {
            const response = await fetch(`${API_BASE_URL}/api/chat/${chatId}/stream`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              const fullChat = await response.json();
              if (fullChat.messages) {
                const updatedChat = { ...chat, messages: fullChat.messages };
                setCurrentChat(updatedChat);
                
                // Update in chats array
                const updatedChats = chats.map(c => c.id === chatId ? updatedChat : c);
                setChats(updatedChats);
                await AsyncStorage.setItem('chats', JSON.stringify(updatedChats));
              }
            }
          } catch (error) {
            console.error('Error loading full chat from server:', error);
            // Use local data
          }
        }
      }
    } catch (error) {
      console.error('Error loading chat:', error);
    }
  };

  const sendMessage = async (content: string, chatId: string) => {
    try {
      const userMessage: Message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content,
        role: 'user',
        timestamp: new Date().toISOString(),
      };

      // Update local state immediately for responsive UI
      const chatIndex = chats.findIndex(c => c.id === chatId);
      if (chatIndex === -1) return;

      const updatedChat = {
        ...chats[chatIndex],
        messages: [...chats[chatIndex].messages, userMessage],
        lastMessage: content,
        updatedAt: new Date().toISOString(),
      };

      const updatedChats = [...chats];
      updatedChats[chatIndex] = updatedChat;
      setChats(updatedChats);
      setCurrentChat(updatedChat);

      // Save locally
      await AsyncStorage.setItem('chats', JSON.stringify(updatedChats));

      // Send to server and get AI response
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: updatedChat.messages,
              chatId: chatId,
            }),
          });

          if (response.ok) {
            const aiResponse = await response.json();
            
            const assistantMessage: Message = {
              id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              content: aiResponse.content,
              role: 'assistant',
              timestamp: new Date().toISOString(),
              metadata: aiResponse.metadata,
            };

            // Update with AI response
            const finalChat = {
              ...updatedChat,
              messages: [...updatedChat.messages, assistantMessage],
              lastMessage: aiResponse.content,
              updatedAt: new Date().toISOString(),
            };

            const finalChats = [...chats];
            finalChats[chatIndex] = finalChat;
            setChats(finalChats);
            setCurrentChat(finalChat);

            // Save locally
            await AsyncStorage.setItem('chats', JSON.stringify(finalChats));
          }
        } catch (error) {
          console.error('Error sending message to server:', error);
          // Add error message locally
          const errorMessage: Message = {
            id: `msg_${Date.now()}_error`,
            content: 'Sorry, I encountered an error. Please check your connection and try again.',
            role: 'assistant',
            timestamp: new Date().toISOString(),
          };

          const errorChat = {
            ...updatedChat,
            messages: [...updatedChat.messages, errorMessage],
            lastMessage: errorMessage.content,
            updatedAt: new Date().toISOString(),
          };

          const errorChats = [...chats];
          errorChats[chatIndex] = errorChat;
          setChats(errorChats);
          setCurrentChat(errorChat);

          await AsyncStorage.setItem('chats', JSON.stringify(errorChats));
        }
      } else {
        // No auth token - show error
        const authErrorMessage: Message = {
          id: `msg_${Date.now()}_auth_error`,
          content: 'Please sign in to continue the conversation.',
          role: 'system',
          timestamp: new Date().toISOString(),
        };

        const authErrorChat = {
          ...updatedChat,
          messages: [...updatedChat.messages, authErrorMessage],
          lastMessage: authErrorMessage.content,
          updatedAt: new Date().toISOString(),
        };

        const authErrorChats = [...chats];
        authErrorChats[chatIndex] = authErrorChat;
        setChats(authErrorChats);
        setCurrentChat(authErrorChat);

        await AsyncStorage.setItem('chats', JSON.stringify(authErrorChats));
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const deleteChat = async (chatId: string) => {
    try {
      const updatedChats = chats.filter(c => c.id !== chatId);
      setChats(updatedChats);

      if (currentChat?.id === chatId) {
        setCurrentChat(null);
      }

      // Save locally
      await AsyncStorage.setItem('chats', JSON.stringify(updatedChats));

      // Delete from server
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        try {
          await fetch(`${API_BASE_URL}/api/chat/${chatId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
        } catch (error) {
          console.error('Error deleting chat from server:', error);
          // Continue anyway - local deletion successful
        }
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  const updateChatTitle = async (chatId: string, title: string) => {
    try {
      const chatIndex = chats.findIndex(c => c.id === chatId);
      if (chatIndex === -1) return;

      const updatedChat = {
        ...chats[chatIndex],
        title,
        updatedAt: new Date().toISOString(),
      };

      const updatedChats = [...chats];
      updatedChats[chatIndex] = updatedChat;
      setChats(updatedChats);

      if (currentChat?.id === chatId) {
        setCurrentChat(updatedChat);
      }

      // Save locally
      await AsyncStorage.setItem('chats', JSON.stringify(updatedChats));

      // Update on server
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        try {
          await fetch(`${API_BASE_URL}/api/chat/${chatId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title }),
          });
        } catch (error) {
          console.error('Error updating chat title on server:', error);
          // Continue anyway - local update successful
        }
      }
    } catch (error) {
      console.error('Error updating chat title:', error);
    }
  };

  const value: ChatContextType = {
    chats,
    currentChat,
    loading,
    createNewChat,
    loadChat,
    sendMessage,
    deleteChat,
    updateChatTitle,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}