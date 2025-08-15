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
  useColorScheme,
  StatusBar,
  Pressable,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useChatContext } from '../contexts/ChatContext';
import { useAuthContext } from '../contexts/AuthContext';
import { realTimeMessaging, RealtimeMessage, TypingEvent, UserPresence } from '../services/RealTimeMessaging';
import { messageEncryption, EncryptedMessage } from '../components/MessageEncryption';
import { crossPlatformSync } from '../services/CrossPlatformSync';

const { width, height } = Dimensions.get('window');

interface EnhancedChatScreenProps {
  chatId: string;
  onClose?: () => void;
}

export default function EnhancedChatScreen({ chatId, onClose }: EnhancedChatScreenProps) {
  const colorScheme = useColorScheme();
  const { currentChat, sendMessage: contextSendMessage, loadChat } = useChatContext();
  const { user } = useAuthContext();
  
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMessageOptions, setShowMessageOptions] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RealtimeMessage[]>([]);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  
  const scrollViewRef = useRef<ScrollView>(null);
  const textInputRef = useRef<TextInput>(null);
  const searchInputRef = useRef<TextInput>(null);
  const messageRefs = useRef<Map<string, View>>(new Map());
  
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnimation = useRef(new Animated.Value(1)).current;
  const searchAnimation = useRef(new Animated.Value(0)).current;

  const isDark = colorScheme === 'dark';
  const colors = {
    background: isDark ? '#000000' : '#ffffff',
    surface: isDark ? '#1c1c1e' : '#f8f9fa',
    surfaceSecondary: isDark ? '#2c2c2e' : '#ffffff',
    primary: '#007AFF',
    secondary: '#5856D6',
    text: isDark ? '#ffffff' : '#1f2937',
    textSecondary: isDark ? '#9ca3af' : '#6b7280',
    border: isDark ? '#38383a' : '#e5e7eb',
    userMessage: '#007AFF',
    assistantMessage: isDark ? '#1f2937' : '#ffffff',
    systemMessage: isDark ? '#5856D6' : '#5856D6',
    error: '#FF3B30',
    success: '#34C759',
    warning: '#FF9500',
    encryption: '#AF52DE',
  };

  // Initialize services
  useEffect(() => {
    initializeServices();
    return cleanupServices;
  }, []);

  // Load chat messages
  useEffect(() => {
    loadChatMessages();
  }, [chatId]);

  // Setup real-time event listeners
  useEffect(() => {
    setupRealtimeListeners();
    return () => {
      realTimeMessaging.removeAllListeners();
    };
  }, []);

  const initializeServices = async () => {
    try {
      if (user) {
        await realTimeMessaging.initialize(user.id);
        await messageEncryption.initialize();
        setEncryptionEnabled(messageEncryption.isEncryptionEnabled());
      }
    } catch (error) {
      console.error('Failed to initialize services:', error);
    }
  };

  const cleanupServices = () => {
    realTimeMessaging.disconnect();
  };

  const setupRealtimeListeners = () => {
    realTimeMessaging.on('connected', () => {
      setIsConnected(true);
      Animated.timing(fadeAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });

    realTimeMessaging.on('disconnected', () => {
      setIsConnected(false);
      Animated.timing(fadeAnimation, {
        toValue: 0.7,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });

    realTimeMessaging.on('message_received', handleMessageReceived);
    realTimeMessaging.on('typing_update', handleTypingUpdate);
    realTimeMessaging.on('presence_update', handlePresenceUpdate);
    realTimeMessaging.on('delivery_receipt', handleDeliveryReceipt);
  };

  const loadChatMessages = async () => {
    try {
      await loadChat(chatId);
      
      // Load local messages for offline support
      const localMessages = await realTimeMessaging.getLocalMessages(chatId);
      if (localMessages.length > 0) {
        setMessages(localMessages);
      }
      
      // Load messages from chat context if available
      if (currentChat?.messages) {
        const formattedMessages: RealtimeMessage[] = currentChat.messages.map(msg => ({
          id: msg.id,
          chatId,
          content: msg.content,
          role: msg.role,
          timestamp: msg.timestamp,
          userId: msg.role === 'user' ? user?.id || 'unknown' : 'assistant',
          status: 'delivered',
          metadata: msg.metadata,
        }));
        setMessages(formattedMessages);
      }
    } catch (error) {
      console.error('Failed to load chat messages:', error);
    }
  };

  const handleMessageReceived = async (message: RealtimeMessage) => {
    if (message.chatId !== chatId) return;

    // Decrypt message if encrypted
    let content = message.content;
    if (encryptionEnabled && message.metadata?.encrypted) {
      try {
        const encryptedMessage: EncryptedMessage = JSON.parse(message.content);
        content = await messageEncryption.decryptMessage(encryptedMessage);
      } catch (error) {
        console.error('Failed to decrypt message:', error);
      }
    }

    const newMessage = { ...message, content };
    setMessages(prev => [...prev, newMessage]);
    
    // Mark as read if chat is active
    realTimeMessaging.markMessageAsRead(message.id);
    
    // Sync with cross-platform
    await crossPlatformSync.syncChatMessage({
      id: message.id,
      content: message.content,
      role: message.role,
      timestamp: message.timestamp,
      chatId: message.chatId,
    });
  };

  const handleTypingUpdate = (event: TypingEvent) => {
    if (event.chatId !== chatId || event.userId === user?.id) return;

    setTypingUsers(prev => {
      if (event.isTyping) {
        return [...prev.filter(id => id !== event.userId), event.userId];
      } else {
        return prev.filter(id => id !== event.userId);
      }
    });
  };

  const handlePresenceUpdate = (presence: UserPresence) => {
    setOnlineUsers(prev => {
      const filtered = prev.filter(p => p.userId !== presence.userId);
      return [...filtered, presence];
    });
  };

  const handleDeliveryReceipt = (receipt: any) => {
    setMessages(prev => prev.map(msg => 
      msg.id === receipt.messageId 
        ? { ...msg, status: receipt.status }
        : msg
    ));
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !user) return;

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let content = input.trim();

    // Encrypt message if encryption is enabled
    if (encryptionEnabled) {
      try {
        const encrypted = await messageEncryption.encryptMessage(content);
        content = JSON.stringify(encrypted);
      } catch (error) {
        console.error('Failed to encrypt message:', error);
      }
    }

    const message: RealtimeMessage = {
      id: messageId,
      chatId,
      content,
      role: 'user',
      timestamp: new Date().toISOString(),
      userId: user.id,
      status: 'sending',
      metadata: {
        encrypted: encryptionEnabled,
      },
    };

    // Add to local state immediately
    setMessages(prev => [...prev, message]);
    setInput('');
    setIsTyping(false);

    try {
      // Send via real-time messaging
      realTimeMessaging.sendMessage(message);
      
      // Also send via chat context for AI response
      await contextSendMessage(encryptionEnabled ? input.trim() : content, chatId);
      
      // Update status
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, status: 'sent' } : msg
      ));

      Vibration.vibrate(50); // Subtle haptic feedback
      
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, status: 'failed' } : msg
      ));
    }
  };

  const handleInputChange = (text: string) => {
    setInput(text);
    
    const wasTyping = isTyping;
    const nowTyping = text.length > 0;
    
    if (wasTyping !== nowTyping) {
      setIsTyping(nowTyping);
      realTimeMessaging.sendTyping(chatId, nowTyping);
    }
  };

  const handleMessageLongPress = (messageId: string) => {
    if (isSelectionMode) {
      toggleMessageSelection(messageId);
    } else {
      setShowMessageOptions(messageId);
      Vibration.vibrate(100);
    }
  };

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const startSelectionMode = (messageId: string) => {
    setIsSelectionMode(true);
    setSelectedMessages(new Set([messageId]));
    setShowMessageOptions(null);
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedMessages(new Set());
  };

  const deleteSelectedMessages = () => {
    Alert.alert(
      'Delete Messages',
      `Are you sure you want to delete ${selectedMessages.size} message(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setMessages(prev => prev.filter(msg => !selectedMessages.has(msg.id)));
            exitSelectionMode();
          },
        },
      ]
    );
  };

  const searchMessages = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const results = messages.filter(msg =>
      msg.content.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(results);
  };

  const scrollToMessage = (messageId: string) => {
    const messageRef = messageRefs.current.get(messageId);
    if (messageRef && scrollViewRef.current) {
      // Implement scroll to message logic
      setShowSearch(false);
      setSearchQuery('');
    }
  };

  const renderMessageStatus = (status: RealtimeMessage['status']) => {
    const iconProps = { size: 12, style: { marginLeft: 4 } };
    
    switch (status) {
      case 'sending':
        return <ActivityIndicator size="small" color={colors.textSecondary} />;
      case 'sent':
        return <Ionicons name="checkmark" color={colors.textSecondary} {...iconProps} />;
      case 'delivered':
        return <Ionicons name="checkmark-done" color={colors.success} {...iconProps} />;
      case 'failed':
        return <Ionicons name="alert-circle" color={colors.error} {...iconProps} />;
      default:
        return null;
    }
  };

  const renderMessage = (message: RealtimeMessage, index: number) => {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';
    const isSelected = selectedMessages.has(message.id);
    const isConsecutive = index > 0 && messages[index - 1].role === message.role;

    let backgroundColor = colors.assistantMessage;
    if (isUser) backgroundColor = colors.userMessage;
    if (isSystem) backgroundColor = colors.systemMessage;

    return (
      <Pressable
        key={message.id}
        onLongPress={() => handleMessageLongPress(message.id)}
        onPress={() => isSelectionMode && toggleMessageSelection(message.id)}
        style={[
          styles.messageContainer,
          isConsecutive && styles.consecutiveMessage,
          isSelected && styles.selectedMessage,
        ]}
        ref={(ref) => {
          if (ref) messageRefs.current.set(message.id, ref);
        }}
      >
        <Animated.View
          style={[
            styles.messageBubble,
            {
              backgroundColor,
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              marginLeft: isUser ? '20%' : 0,
              marginRight: isUser ? 0 : '20%',
              borderColor: colors.border,
              borderWidth: isUser ? 0 : StyleSheet.hairlineWidth,
            },
          ]}
        >
          {message.metadata?.encrypted && (
            <View style={styles.encryptionBadge}>
              <Ionicons name="lock-closed" size={12} color={colors.encryption} />
              <Text style={[styles.encryptionText, { color: colors.encryption }]}>
                Encrypted
              </Text>
            </View>
          )}
          
          <Text
            style={[
              styles.messageText,
              {
                color: isUser || isSystem ? '#ffffff' : colors.text,
              },
            ]}
          >
            {message.content}
          </Text>

          <View style={styles.messageFooter}>
            <Text
              style={[
                styles.timestamp,
                {
                  color: isUser || isSystem ? 'rgba(255,255,255,0.7)' : colors.textSecondary,
                },
              ]}
            >
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            
            {isUser && renderMessageStatus(message.status)}
          </View>
        </Animated.View>
      </Pressable>
    );
  };

  const renderTypingIndicator = () => {
    if (typingUsers.length === 0) return null;

    return (
      <Animated.View style={styles.typingContainer}>
        <View style={[styles.typingBubble, { backgroundColor: colors.surface }]}>
          <View style={styles.typingDots}>
            {[0, 1, 2].map(i => (
              <Animated.View
                key={i}
                style={[
                  styles.typingDot,
                  { backgroundColor: colors.textSecondary },
                ]}
              />
            ))}
          </View>
        </View>
        <Text style={[styles.typingText, { color: colors.textSecondary }]}>
          AI is typing...
        </Text>
      </Animated.View>
    );
  };

  const renderConnectionBanner = () => {
    if (isConnected) return null;

    return (
      <Animated.View
        style={[
          styles.connectionBanner,
          { backgroundColor: colors.warning, opacity: fadeAnimation },
        ]}
      >
        <Ionicons name="wifi-outline" size={16} color="#ffffff" />
        <Text style={styles.connectionText}>Reconnecting...</Text>
      </Animated.View>
    );
  };

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.headerLeft}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {currentChat?.title || 'Chat'}
          </Text>
          <View style={styles.headerSubtitle}>
            <View style={[
              styles.statusDot,
              { backgroundColor: isConnected ? colors.success : colors.error },
            ]} />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              {isConnected ? 'Connected' : 'Offline'}
            </Text>
            {encryptionEnabled && (
              <>
                <View style={styles.statusSeparator} />
                <Ionicons name="lock-closed" size={12} color={colors.encryption} />
                <Text style={[styles.statusText, { color: colors.encryption }]}>
                  Encrypted
                </Text>
              </>
            )}
          </View>
        </View>
      </View>

      <View style={styles.headerActions}>
        {isSelectionMode ? (
          <>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={deleteSelectedMessages}
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={exitSelectionMode}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowSearch(true)}
            >
              <Ionicons name="search-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  const renderSearchBar = () => {
    if (!showSearch) return null;

    return (
      <Animated.View
        style={[
          styles.searchBar,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.searchInput}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            ref={searchInputRef}
            style={[styles.searchTextInput, { color: colors.text }]}
            placeholder="Search messages..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={searchMessages}
            autoFocus
          />
        </View>
        <TouchableOpacity
          style={styles.searchCancel}
          onPress={() => {
            setShowSearch(false);
            setSearchQuery('');
            setSearchResults([]);
          }}
        >
          <Text style={[styles.searchCancelText, { color: colors.primary }]}>
            Cancel
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderInput = () => (
    <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      <View style={styles.inputRow}>
        <TextInput
          ref={textInputRef}
          style={[
            styles.textInput,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
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
              opacity: (!input.trim() || !isConnected) ? 0.5 : 1,
            },
          ]}
          onPress={handleSendMessage}
          disabled={!input.trim() || !isConnected}
        >
          <Ionicons name="send" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.surface}
      />
      
      <Animated.View style={[styles.container, { opacity: fadeAnimation }]}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {renderHeader()}
          {renderSearchBar()}
          {renderConnectionBanner()}

          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <LinearGradient
                  colors={[colors.primary + '20', colors.secondary + '20']}
                  style={styles.emptyGradient}
                >
                  <Ionicons name="chatbubbles-outline" size={64} color={colors.primary} />
                </LinearGradient>
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

          {renderInput()}
        </KeyboardAvoidingView>
      </Animated.View>

      {/* Message Options Modal */}
      <Modal
        visible={showMessageOptions !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMessageOptions(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowMessageOptions(null)}
        >
          <BlurView intensity={20} style={styles.modalOverlay}>
            <View style={[styles.messageOptionsModal, { backgroundColor: colors.surface }]}>
              <TouchableOpacity
                style={styles.optionButton}
                onPress={() => {
                  if (showMessageOptions) {
                    startSelectionMode(showMessageOptions);
                  }
                }}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.text} />
                <Text style={[styles.optionText, { color: colors.text }]}>Select</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
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
  backButton: {
    marginRight: 8,
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
    fontSize: 12,
  },
  statusSeparator: {
    width: 4,
    height: 4,
    backgroundColor: '#8E8E93',
    borderRadius: 2,
    marginHorizontal: 6,
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
    marginLeft: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(118, 118, 128, 0.12)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 8,
  },
  searchCancel: {
    marginLeft: 12,
  },
  searchCancelText: {
    fontSize: 16,
  },
  connectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  connectionText: {
    color: '#ffffff',
    fontSize: 14,
    marginLeft: 8,
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
  },
  emptyGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  messageContainer: {
    marginBottom: 8,
  },
  consecutiveMessage: {
    marginBottom: 2,
  },
  selectedMessage: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 8,
    margin: -4,
    padding: 4,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 18,
  },
  encryptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  encryptionText: {
    fontSize: 10,
    marginLeft: 4,
    fontWeight: '500',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
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
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  typingBubble: {
    padding: 8,
    borderRadius: 12,
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
    fontSize: 12,
    fontStyle: 'italic',
  },
  inputContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageOptionsModal: {
    borderRadius: 12,
    padding: 8,
    minWidth: 120,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  optionText: {
    fontSize: 16,
    marginLeft: 12,
  },
});