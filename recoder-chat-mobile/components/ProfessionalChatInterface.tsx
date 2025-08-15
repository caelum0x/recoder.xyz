import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  Animated,
  PanResponder,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChatContext } from '../contexts/ChatContext';
import { useAuthContext } from '../contexts/AuthContext';
import { crossPlatformSync } from '../services/CrossPlatformSync';
import { notificationService } from '../services/NotificationService';

const { width, height } = Dimensions.get('window');

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  status?: 'sending' | 'sent' | 'delivered' | 'failed';
  metadata?: {
    model?: string;
    tokens?: number;
    cost?: number;
    reasoning?: any;
    attachments?: any[];
  };
}

interface ProfessionalChatProps {
  chatId: string;
  onClose?: () => void;
}

export default function ProfessionalChatInterface({ chatId, onClose }: ProfessionalChatProps) {
  const colorScheme = useColorScheme();
  const { currentChat, sendMessage, loadChat, updateChatTitle } = useChatContext();
  const { user } = useAuthContext();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [selectedModel, setSelectedModel] = useState('claude-3-sonnet');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showAttachments, setShowAttachments] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const scrollViewRef = useRef<ScrollView>(null);
  const textInputRef = useRef<TextInput>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const connectionRetryRef = useRef<NodeJS.Timeout>();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(height)).current;

  const isDark = colorScheme === 'dark';
  const colors = {
    background: isDark ? '#000000' : '#ffffff',
    surface: isDark ? '#1c1c1e' : '#f8f9fa',
    primary: '#3b82f6',
    secondary: '#6b7280',
    text: isDark ? '#ffffff' : '#1f2937',
    textSecondary: isDark ? '#9ca3af' : '#6b7280',
    border: isDark ? '#374151' : '#e5e7eb',
    userMessage: '#3b82f6',
    assistantMessage: isDark ? '#1f2937' : '#ffffff',
    error: '#ef4444',
    success: '#10b981',
    warning: '#f59e0b',
  };

  // WebSocket connection for real-time messaging
  useEffect(() => {
    initializeRealTimeConnection();
    loadChatMessages();
    
    return () => {
      cleanupConnection();
    };
  }, [chatId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Typing indicator debounce
  useEffect(() => {
    if (isTyping) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        sendTypingStatus(false);
      }, 2000);
    }
    
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [input]);

  const initializeRealTimeConnection = useCallback(async () => {
    try {
      // Initialize cross-platform sync for real-time messaging
      await crossPlatformSync.initialize();
      
      // Listen for sync events
      crossPlatformSync.on('message-synced', (data: any) => {
        if (data.chatId === chatId) {
          updateMessageStatus(data.message.id, 'delivered');
        }
      });
      
      crossPlatformSync.on('presence-updated', (data: any) => {
        updateUserPresence(data.userPresence);
      });
      
      crossPlatformSync.on('online', () => {
        setIsConnected(true);
        syncPendingMessages();
      });
      
      crossPlatformSync.on('offline', () => {
        setIsConnected(false);
        startConnectionRetry();
      });
      
      setIsConnected(true);
    } catch (error) {
      console.error('Failed to initialize real-time connection:', error);
      setIsConnected(false);
      startConnectionRetry();
    }
  }, [chatId]);

  const cleanupConnection = () => {
    crossPlatformSync.removeAllListeners();
    if (connectionRetryRef.current) {
      clearTimeout(connectionRetryRef.current);
    }
  };

  const startConnectionRetry = () => {
    if (connectionRetryRef.current) {
      clearTimeout(connectionRetryRef.current);
    }
    
    connectionRetryRef.current = setTimeout(() => {
      initializeRealTimeConnection();
    }, 5000);
  };

  const loadChatMessages = async () => {
    try {
      await loadChat(chatId);
      if (currentChat?.messages) {
        setMessages(currentChat.messages.map(msg => ({
          ...msg,
          status: 'delivered',
        })));
      }
    } catch (error) {
      console.error('Failed to load chat messages:', error);
    }
  };

  const sendTypingStatus = (typing: boolean) => {
    if (user && isConnected) {
      crossPlatformSync.sendPresenceUpdate(
        typing ? 'typing' : 'online',
        { currentProject: chatId }
      );
    }
  };

  const updateUserPresence = (userPresence: any[]) => {
    const typing = userPresence
      .filter(p => p.status === 'typing' && p.userId !== user?.id)
      .map(p => p.userId);
    setTypingUsers(typing);
  };

  const updateMessageStatus = (messageId: string, status: Message['status']) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, status } : msg
    ));
  };

  const syncPendingMessages = async () => {
    const pendingMessages = messages.filter(msg => 
      msg.status === 'sending' && msg.role === 'user'
    );
    
    for (const message of pendingMessages) {
      try {
        await crossPlatformSync.syncChatMessage({
          id: message.id,
          content: message.content,
          role: message.role,
          timestamp: message.timestamp,
          chatId,
        });
        updateMessageStatus(message.id, 'delivered');
      } catch (error) {
        updateMessageStatus(message.id, 'failed');
      }
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userMessage: Message = {
      id: messageId,
      content: input.trim(),
      role: 'user',
      timestamp: new Date().toISOString(),
      status: 'sending',
      metadata: {
        model: selectedModel,
      },
    };

    // Add message immediately for responsive UI
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(false);
    sendTypingStatus(false);

    try {
      // Update status to sent
      updateMessageStatus(messageId, 'sent');
      
      // Send via chat context (handles server communication)
      await sendMessage(userMessage.content, chatId);
      
      // Sync with cross-platform if connected
      if (isConnected) {
        await crossPlatformSync.syncChatMessage({
          id: userMessage.id,
          content: userMessage.content,
          role: userMessage.role,
          timestamp: userMessage.timestamp,
          chatId,
        });
        updateMessageStatus(messageId, 'delivered');
      }
      
      // Send notification if app is in background
      await notificationService.scheduleLocalNotification({
        title: 'Message Sent',
        body: userMessage.content.length > 50 
          ? userMessage.content.substring(0, 50) + '...' 
          : userMessage.content,
        data: { chatId, messageId },
      });
      
    } catch (error) {
      console.error('Failed to send message:', error);
      updateMessageStatus(messageId, 'failed');
      
      // Show retry option
      Alert.alert(
        'Message Failed',
        'Your message could not be sent. Would you like to retry?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => handleSendMessage() },
        ]
      );
    }
  };

  const handleInputChange = (text: string) => {
    setInput(text);
    
    if (text.length > 0 && !isTyping) {
      setIsTyping(true);
      sendTypingStatus(true);
    } else if (text.length === 0 && isTyping) {
      setIsTyping(false);
      sendTypingStatus(false);
    }
  };

  const handleRetryMessage = async (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    
    updateMessageStatus(messageId, 'sending');
    
    try {
      await sendMessage(message.content, chatId);
      updateMessageStatus(messageId, 'delivered');
    } catch (error) {
      updateMessageStatus(messageId, 'failed');
    }
  };

  const handleVoiceInput = () => {
    // TODO: Implement voice input functionality
    Alert.alert('Voice Input', 'Voice input feature coming soon!');
  };

  const handleCameraInput = () => {
    // TODO: Implement camera input functionality  
    Alert.alert('Camera Input', 'Camera input feature coming soon!');
  };

  const renderMessageStatus = (status: Message['status']) => {
    switch (status) {
      case 'sending':
        return <ActivityIndicator size="small" color={colors.secondary} />;
      case 'sent':
        return <Ionicons name="checkmark" size={12} color={colors.secondary} />;
      case 'delivered':
        return <Ionicons name="checkmark-done" size={12} color={colors.success} />;
      case 'failed':
        return <Ionicons name="alert-circle" size={12} color={colors.error} />;
      default:
        return null;
    }
  };

  const renderMessage = (message: Message, index: number) => {
    const isUser = message.role === 'user';
    const isConsecutive = index > 0 && messages[index - 1].role === message.role;
    const showTimestamp = index === messages.length - 1 || 
      messages[index + 1]?.role !== message.role ||
      new Date(messages[index + 1]?.timestamp).getTime() - new Date(message.timestamp).getTime() > 300000; // 5 minutes

    return (
      <View key={message.id} style={[styles.messageWrapper, isConsecutive && styles.consecutiveMessage]}>
        <Animated.View style={[
          styles.messageBubble,
          isUser ? [styles.userMessage, { backgroundColor: colors.userMessage }] : [styles.assistantMessage, { backgroundColor: colors.assistantMessage, borderColor: colors.border }]
        ]}>
          <Text style={[
            styles.messageText,
            isUser ? styles.userMessageText : [styles.assistantMessageText, { color: colors.text }]
          ]}>
            {message.content}
          </Text>
          
          {message.metadata && (
            <View style={styles.messageMetadata}>
              {message.metadata.model && (
                <Text style={[styles.modelTag, { color: colors.textSecondary }]}>
                  {message.metadata.model}
                </Text>
              )}
              {message.metadata.tokens && (
                <Text style={[styles.tokenCount, { color: colors.textSecondary }]}>
                  {message.metadata.tokens} tokens
                </Text>
              )}
            </View>
          )}
          
          <View style={styles.messageFooter}>
            <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
              {new Date(message.timestamp).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </Text>
            
            {isUser && (
              <View style={styles.messageStatus}>
                {message.status === 'failed' ? (
                  <TouchableOpacity onPress={() => handleRetryMessage(message.id)}>
                    {renderMessageStatus(message.status)}
                  </TouchableOpacity>
                ) : (
                  renderMessageStatus(message.status)
                )}
              </View>
            )}
          </View>
        </Animated.View>
        
        {showTimestamp && (
          <Text style={[styles.timestampSeparator, { color: colors.textSecondary }]}>
            {new Date(message.timestamp).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        )}
      </View>
    );
  };

  const renderTypingIndicator = () => {
    if (typingUsers.length === 0) return null;
    
    return (
      <View style={styles.typingIndicator}>
        <View style={[styles.typingBubble, { backgroundColor: colors.surface }]}>
          <View style={styles.typingDots}>
            {[0, 1, 2].map(i => (
              <Animated.View
                key={i}
                style={[
                  styles.typingDot,
                  { backgroundColor: colors.textSecondary }
                ]}
              />
            ))}
          </View>
        </View>
        <Text style={[styles.typingText, { color: colors.textSecondary }]}>
          {typingUsers.length === 1 ? 'AI is typing...' : 'Multiple users typing...'}
        </Text>
      </View>
    );
  };

  const renderConnectionStatus = () => {
    if (isConnected) return null;
    
    return (
      <Animated.View style={[styles.connectionStatus, { backgroundColor: colors.warning, opacity: fadeAnim }]}>
        <Ionicons name="wifi-outline" size={16} color="#ffffff" />
        <Text style={styles.connectionStatusText}>Reconnecting...</Text>
        <TouchableOpacity onPress={initializeRealTimeConnection}>
          <Text style={styles.retryButton}>Retry</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                {currentChat?.title || 'New Chat'}
              </Text>
              <View style={styles.headerSubtitle}>
                <View style={[
                  styles.statusDot, 
                  { backgroundColor: isConnected ? colors.success : colors.error }
                ]} />
                <Text style={[styles.statusText, { color: colors.textSecondary }]}>
                  {isConnected ? 'Connected' : 'Offline'}
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={() => setShowModelSelector(true)}
            >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Connection Status */}
        {renderConnectionStatus()}

        {/* Messages */}
        <ScrollView 
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons 
                name="chatbubbles-outline" 
                size={64} 
                color={colors.textSecondary} 
              />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Start a conversation
              </Text>
              <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
                Send a message to begin chatting with AI
              </Text>
            </View>
          ) : (
            messages.map(renderMessage)
          )}
          
          {renderTypingIndicator()}
        </ScrollView>

        {/* Input Container */}
        <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          {/* Attachments Panel */}
          {showAttachments && (
            <View style={[styles.attachmentPanel, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
              <TouchableOpacity style={styles.attachmentButton} onPress={handleCameraInput}>
                <Ionicons name="camera-outline" size={24} color={colors.primary} />
                <Text style={[styles.attachmentLabel, { color: colors.text }]}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachmentButton} onPress={handleVoiceInput}>
                <Ionicons name="mic-outline" size={24} color={colors.primary} />
                <Text style={[styles.attachmentLabel, { color: colors.text }]}>Voice</Text>
              </TouchableOpacity>
            </View>
          )}
          
          <View style={styles.inputRow}>
            <TouchableOpacity 
              style={styles.attachButton}
              onPress={() => setShowAttachments(!showAttachments)}
            >
              <Ionicons 
                name={showAttachments ? "close" : "add"} 
                size={24} 
                color={colors.textSecondary} 
              />
            </TouchableOpacity>
            
            <TextInput
              ref={textInputRef}
              style={[styles.textInput, { 
                backgroundColor: colors.background, 
                borderColor: colors.border,
                color: colors.text 
              }]}
              value={input}
              onChangeText={handleInputChange}
              placeholder="Type a message..."
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={4000}
              onSubmitEditing={handleSendMessage}
              blurOnSubmit={false}
            />
            
            <TouchableOpacity 
              style={[
                styles.sendButton, 
                { 
                  backgroundColor: colors.primary,
                  opacity: (!input.trim() || !isConnected) ? 0.5 : 1 
                }
              ]}
              onPress={handleSendMessage}
              disabled={!input.trim() || !isConnected}
            >
              <Ionicons name="send" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Model Selector Modal */}
        <Modal
          visible={showModelSelector}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          {/* Model selector content would go here */}
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  closeButton: {
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  headerSubtitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
  },
  headerActions: {
    flexDirection: 'row',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  connectionStatusText: {
    color: '#ffffff',
    fontSize: 14,
    marginHorizontal: 8,
  },
  retryButton: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  messageWrapper: {
    marginBottom: 16,
  },
  consecutiveMessage: {
    marginBottom: 4,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    marginLeft: '15%',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    marginRight: '15%',
    borderWidth: StyleSheet.hairlineWidth,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#ffffff',
  },
  assistantMessageText: {
    // Color set dynamically
  },
  messageMetadata: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  modelTag: {
    fontSize: 12,
    opacity: 0.8,
  },
  tokenCount: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.8,
  },
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  timestamp: {
    fontSize: 12,
  },
  messageStatus: {
    marginLeft: 8,
  },
  timestampSeparator: {
    fontSize: 12,
    textAlign: 'center',
    marginVertical: 16,
    opacity: 0.7,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  typingBubble: {
    padding: 12,
    borderRadius: 16,
    marginRight: 8,
  },
  typingDots: {
    flexDirection: 'row',
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 1,
  },
  typingText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  inputContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachmentPanel: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachmentButton: {
    alignItems: 'center',
    marginRight: 24,
  },
  attachmentLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 120,
    marginRight: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});