/**
 * Mobile Chat Screen - Adapted from recoder-chat
 * Provides full chat functionality with mobile-optimized UI
 */

import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dualPlatformClient, ChatMessage } from '../services/DualPlatformClient';
import { localAI } from '../lib/services/LocalAIIntegration';

const { width } = Dimensions.get('window');

interface ChatScreenProps {
  chatId?: string;
  initialMessages?: ChatMessage[];
  selectedModel?: string;
  onModelChange?: (model: string) => void;
}

const ChatScreen: React.FC<ChatScreenProps> = ({
  chatId,
  initialMessages = [],
  selectedModel = '',
  onModelChange,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [currentModel, setCurrentModel] = useState(selectedModel);
  
  const scrollViewRef = useRef<ScrollView>(null);
  const textInputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadAvailableModels();
    if (chatId) {
      loadChatHistory();
    }
  }, [chatId]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const loadAvailableModels = async () => {
    try {
      const models = await localAI.getAvailableModels();
      setAvailableModels([...models.local, ...models.cloud]);
      
      if (!currentModel && models.local.length > 0) {
        setCurrentModel(models.local[0].id);
        onModelChange?.(models.local[0].id);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const loadChatHistory = async () => {
    if (!chatId) return;
    
    try {
      const response = await dualPlatformClient.getChatHistory(50);
      if (response.success && response.data) {
        setMessages(response.data);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      if (currentModel) {
        // Use local AI integration
        const response = await localAI.chat(newMessages, {
          model: currentModel,
          taskType: 'general',
        });
        
        setMessages([...newMessages, response]);
      } else {
        // Fallback to platform API
        const response = await dualPlatformClient.sendChatMessage(
          userMessage.content, 
          currentModel
        );

        if (response.success && response.data) {
          setMessages([...newMessages, response.data]);
        } else {
          throw new Error(response.error || 'Failed to send message');
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
      
      // Remove the failed message
      setMessages(messages);
    } finally {
      setIsLoading(false);
    }
  };

  const streamMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    // Add placeholder for streaming response
    const streamingMessage: ChatMessage = {
      id: Date.now().toString() + '_streaming',
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    
    setMessages([...newMessages, streamingMessage]);

    try {
      const stream = localAI.streamChat(newMessages, {
        model: currentModel,
        taskType: 'general',
      });

      let streamedContent = '';
      for await (const chunk of stream) {
        streamedContent += chunk;
        
        // Update the streaming message
        setMessages(prev => prev.map(msg => 
          msg.id === streamingMessage.id 
            ? { ...msg, content: streamedContent }
            : msg
        ));
      }
    } catch (error) {
      console.error('Streaming failed:', error);
      Alert.alert('Error', 'Failed to stream message. Please try again.');
      setMessages(newMessages);
    } finally {
      setIsStreaming(false);
    }
  };

  const regenerateLastMessage = async () => {
    if (messages.length < 2) return;

    const lastUserMessage = [...messages]
      .reverse()
      .find(msg => msg.role === 'user');

    if (!lastUserMessage) return;

    // Remove the last assistant message
    const messagesUpToUser = messages.filter(msg => 
      msg.timestamp <= lastUserMessage.timestamp
    );

    setMessages(messagesUpToUser);
    setIsLoading(true);

    try {
      const response = await localAI.chat(messagesUpToUser, {
        model: currentModel,
        taskType: 'general',
      });
      
      setMessages([...messagesUpToUser, response]);
    } catch (error) {
      console.error('Failed to regenerate:', error);
      Alert.alert('Error', 'Failed to regenerate response');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModelSelect = (model: any) => {
    setCurrentModel(model.id);
    setShowModelSelector(false);
    onModelChange?.(model.id);
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const renderMessage = (message: ChatMessage, index: number) => {
    const isUser = message.role === 'user';
    const isLastMessage = index === messages.length - 1;
    
    return (
      <View key={message.id} style={styles.messageContainer}>
        <View style={[
          styles.messageBubble,
          isUser ? styles.userMessage : styles.assistantMessage
        ]}>
          <Text style={[
            styles.messageText,
            isUser ? styles.userMessageText : styles.assistantMessageText
          ]}>
            {message.content}
          </Text>
          
          <View style={styles.messageFooter}>
            <Text style={[
              styles.timestamp,
              isUser ? styles.userTimestamp : styles.assistantTimestamp
            ]}>
              {formatTimestamp(message.timestamp)}
            </Text>
            
            {message.model && (
              <Text style={[
                styles.modelTag,
                isUser ? styles.userModelTag : styles.assistantModelTag
              ]}>
                {message.model}
              </Text>
            )}
          </View>
        </View>
        
        {!isUser && isLastMessage && !isLoading && (
          <TouchableOpacity 
            style={styles.regenerateButton}
            onPress={regenerateLastMessage}
          >
            <Text style={styles.regenerateButtonText}>🔄</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.modelSelector}
            onPress={() => setShowModelSelector(true)}
          >
            <Text style={styles.modelSelectorText}>
              {currentModel ? 
                availableModels.find(m => m.id === currentModel)?.name || currentModel :
                'Select Model'
              }
            </Text>
            <Text style={styles.modelSelectorArrow}>▼</Text>
          </TouchableOpacity>
          
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={loadChatHistory}
            >
              <Text style={styles.headerButtonText}>🔄</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages */}
        <ScrollView 
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>💬</Text>
              <Text style={styles.emptyStateTitle}>Start a conversation</Text>
              <Text style={styles.emptyStateDescription}>
                Ask me anything! I can help with coding, explanations, and more.
              </Text>
            </View>
          ) : (
            messages.map(renderMessage)
          )}
          
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#3b82f6" />
              <Text style={styles.loadingText}>Thinking...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            ref={textInputRef}
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Message..."
            multiline
            maxLength={4000}
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
          
          <View style={styles.inputActions}>
            <TouchableOpacity 
              style={[styles.sendButton, { 
                opacity: (!input.trim() || isLoading) ? 0.5 : 1 
              }]}
              onPress={sendMessage}
              disabled={!input.trim() || isLoading}
            >
              <Text style={styles.sendButtonText}>
                {isLoading ? '⏳' : '→'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Model Selector Modal */}
        {showModelSelector && (
          <View style={styles.modalOverlay}>
            <View style={styles.modelSelectorModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select AI Model</Text>
                <TouchableOpacity 
                  style={styles.modalClose}
                  onPress={() => setShowModelSelector(false)}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.modelList}>
                {availableModels.map((model, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.modelItem,
                      currentModel === model.id && styles.selectedModelItem
                    ]}
                    onPress={() => handleModelSelect(model)}
                  >
                    <View style={styles.modelInfo}>
                      <Text style={styles.modelName}>{model.name}</Text>
                      <Text style={styles.modelProvider}>{model.provider}</Text>
                    </View>
                    
                    <View style={styles.modelStatus}>
                      <Text style={[
                        styles.statusBadge,
                        { backgroundColor: model.status === 'available' ? '#10b981' : '#6b7280' }
                      ]}>
                        {model.status}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modelSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modelSelectorText: {
    fontSize: 14,
    color: '#374151',
    marginRight: 8,
  },
  modelSelectorArrow: {
    fontSize: 12,
    color: '#6b7280',
  },
  headerActions: {
    flexDirection: 'row',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: 16,
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
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptyStateDescription: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  messageContainer: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#3b82f6',
    marginLeft: 'auto',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 4,
  },
  userMessageText: {
    color: '#ffffff',
  },
  assistantMessageText: {
    color: '#1f2937',
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
  userTimestamp: {
    color: '#e0e7ff',
  },
  assistantTimestamp: {
    color: '#6b7280',
  },
  modelTag: {
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  userModelTag: {
    backgroundColor: '#1e40af',
    color: '#ffffff',
  },
  assistantModelTag: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
  },
  regenerateButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  regenerateButtonText: {
    fontSize: 14,
  },
  loadingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6b7280',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 12,
  },
  inputActions: {
    flexDirection: 'row',
  },
  sendButton: {
    width: 44,
    height: 44,
    backgroundColor: '#3b82f6',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    fontSize: 18,
    color: '#ffffff',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelSelectorModal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: width * 0.9,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#6b7280',
  },
  modelList: {
    maxHeight: 400,
  },
  modelItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  selectedModelItem: {
    backgroundColor: '#eff6ff',
  },
  modelInfo: {
    flex: 1,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 2,
  },
  modelProvider: {
    fontSize: 14,
    color: '#6b7280',
  },
  modelStatus: {
    marginLeft: 12,
  },
  statusBadge: {
    fontSize: 12,
    color: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    textAlign: 'center',
    minWidth: 60,
  },
});

export default ChatScreen;