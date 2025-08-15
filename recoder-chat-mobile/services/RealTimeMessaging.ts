import { Platform } from 'react-native';
import { EventEmitter } from 'events';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export interface RealtimeMessage {
  id: string;
  chatId: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  userId: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  metadata?: {
    model?: string;
    tokens?: number;
    cost?: number;
    attachments?: any[];
    edited?: boolean;
    editedAt?: string;
    encrypted?: boolean;
  };
}

export interface TypingEvent {
  userId: string;
  chatId: string;
  isTyping: boolean;
  timestamp: string;
}

export interface UserPresence {
  userId: string;
  status: 'online' | 'away' | 'offline' | 'typing';
  lastSeen: string;
  platform: 'mobile' | 'web' | 'desktop';
  currentChat?: string;
}

export interface MessageDeliveryReceipt {
  messageId: string;
  userId: string;
  status: 'delivered' | 'read';
  timestamp: string;
}

class RealTimeMessagingService extends EventEmitter {
  private static instance: RealTimeMessagingService;
  private webSocket: WebSocket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageQueue: RealtimeMessage[] = [];
  private typingTimeout: NodeJS.Timeout | null = null;
  private currentUserId: string | null = null;
  private apiBaseUrl: string;

  private constructor() {
    super();
    this.apiBaseUrl = __DEV__ ? 'ws://localhost:3001' : 'wss://api.recoder.xyz';
    this.setupEventListeners();
  }

  static getInstance(): RealTimeMessagingService {
    if (!RealTimeMessagingService.instance) {
      RealTimeMessagingService.instance = new RealTimeMessagingService();
    }
    return RealTimeMessagingService.instance;
  }

  private setupEventListeners() {
    // Handle app state changes for connection management
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // React Native app state listeners would go here
      // For now, we'll handle connection management manually
    }
  }

  async initialize(userId: string): Promise<void> {
    this.currentUserId = userId;
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.isConnected || !this.currentUserId) return;

    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (!token) {
        throw new Error('No authentication token available');
      }

      const wsUrl = `${this.apiBaseUrl}/ws?token=${encodeURIComponent(token)}&platform=mobile`;
      
      // Use platform-appropriate WebSocket
      const WebSocketClass = Platform.OS === 'web' 
        ? (global as any).WebSocket 
        : WebSocket;

      this.webSocket = new WebSocketClass(wsUrl);
      
      this.webSocket.onopen = this.handleOpen.bind(this);
      this.webSocket.onmessage = this.handleMessage.bind(this);
      this.webSocket.onclose = this.handleClose.bind(this);
      this.webSocket.onerror = this.handleError.bind(this);

    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
      this.handleReconnect();
    }
  }

  private handleOpen() {
    console.log('WebSocket connection established');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.startHeartbeat();
    this.processMessageQueue();
    this.emit('connected');
    
    // Send initial presence
    this.updatePresence('online');
  }

  private handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'message':
          this.handleIncomingMessage(data.payload);
          break;
        case 'typing':
          this.handleTypingEvent(data.payload);
          break;
        case 'presence':
          this.handlePresenceUpdate(data.payload);
          break;
        case 'delivery_receipt':
          this.handleDeliveryReceipt(data.payload);
          break;
        case 'pong':
          // Heartbeat response
          break;
        case 'error':
          console.error('Server error:', data.payload);
          this.emit('error', data.payload);
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private handleClose(event: CloseEvent) {
    console.log('WebSocket connection closed:', event.code, event.reason);
    this.isConnected = false;
    this.stopHeartbeat();
    this.emit('disconnected', { code: event.code, reason: event.reason });
    
    if (event.code !== 1000) { // Not a normal closure
      this.handleReconnect();
    }
  }

  private handleError(error: Event) {
    console.error('WebSocket error:', error);
    this.emit('error', error);
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('max_reconnect_attempts_reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.webSocket) {
        this.webSocket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleIncomingMessage(message: RealtimeMessage) {
    // Store message locally for offline access
    this.storeMessageLocally(message);
    
    // Send delivery receipt
    this.sendDeliveryReceipt(message.id, 'delivered');
    
    this.emit('message_received', message);
  }

  private handleTypingEvent(typingEvent: TypingEvent) {
    this.emit('typing_update', typingEvent);
  }

  private handlePresenceUpdate(presence: UserPresence) {
    this.emit('presence_update', presence);
  }

  private handleDeliveryReceipt(receipt: MessageDeliveryReceipt) {
    this.emit('delivery_receipt', receipt);
  }

  private async storeMessageLocally(message: RealtimeMessage) {
    try {
      const key = `message_${message.chatId}_${message.id}`;
      await AsyncStorage.setItem(key, JSON.stringify(message));
    } catch (error) {
      console.error('Failed to store message locally:', error);
    }
  }

  private processMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessageDirect(message);
      }
    }
  }

  sendMessage(message: RealtimeMessage): void {
    if (this.isConnected) {
      this.sendMessageDirect(message);
    } else {
      // Queue message for when connection is restored
      this.messageQueue.push(message);
      // Also store locally
      this.storeMessageLocally(message);
    }
  }

  private sendMessageDirect(message: RealtimeMessage) {
    if (!this.webSocket || !this.isConnected) return;

    const payload = {
      type: 'message',
      payload: message,
      timestamp: new Date().toISOString(),
    };

    try {
      this.webSocket.send(JSON.stringify(payload));
      this.emit('message_sent', message);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Re-queue the message
      this.messageQueue.push(message);
    }
  }

  sendTyping(chatId: string, isTyping: boolean): void {
    if (!this.isConnected || !this.currentUserId) return;

    // Debounce typing events
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    if (isTyping) {
      this.typingTimeout = setTimeout(() => {
        this.sendTyping(chatId, false);
      }, 3000); // Stop typing after 3 seconds of inactivity
    }

    const typingEvent: TypingEvent = {
      userId: this.currentUserId,
      chatId,
      isTyping,
      timestamp: new Date().toISOString(),
    };

    const payload = {
      type: 'typing',
      payload: typingEvent,
    };

    try {
      this.webSocket?.send(JSON.stringify(payload));
    } catch (error) {
      console.error('Failed to send typing event:', error);
    }
  }

  updatePresence(status: UserPresence['status'], currentChat?: string): void {
    if (!this.isConnected || !this.currentUserId) return;

    const presence: UserPresence = {
      userId: this.currentUserId,
      status,
      lastSeen: new Date().toISOString(),
      platform: 'mobile',
      currentChat,
    };

    const payload = {
      type: 'presence',
      payload: presence,
    };

    try {
      this.webSocket?.send(JSON.stringify(payload));
    } catch (error) {
      console.error('Failed to update presence:', error);
    }
  }

  private sendDeliveryReceipt(messageId: string, status: 'delivered' | 'read'): void {
    if (!this.isConnected || !this.currentUserId) return;

    const receipt: MessageDeliveryReceipt = {
      messageId,
      userId: this.currentUserId,
      status,
      timestamp: new Date().toISOString(),
    };

    const payload = {
      type: 'delivery_receipt',
      payload: receipt,
    };

    try {
      this.webSocket?.send(JSON.stringify(payload));
    } catch (error) {
      console.error('Failed to send delivery receipt:', error);
    }
  }

  markMessageAsRead(messageId: string): void {
    this.sendDeliveryReceipt(messageId, 'read');
  }

  async getLocalMessages(chatId: string): Promise<RealtimeMessage[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const messageKeys = keys.filter(key => key.startsWith(`message_${chatId}_`));
      const messages: RealtimeMessage[] = [];

      for (const key of messageKeys) {
        const messageJson = await AsyncStorage.getItem(key);
        if (messageJson) {
          messages.push(JSON.parse(messageJson));
        }
      }

      return messages.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    } catch (error) {
      console.error('Failed to get local messages:', error);
      return [];
    }
  }

  async clearLocalMessages(chatId: string): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const messageKeys = keys.filter(key => key.startsWith(`message_${chatId}_`));
      await AsyncStorage.multiRemove(messageKeys);
    } catch (error) {
      console.error('Failed to clear local messages:', error);
    }
  }

  getConnectionStatus(): {
    isConnected: boolean;
    reconnectAttempts: number;
    queuedMessages: number;
  } {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
    };
  }

  disconnect(): void {
    this.isConnected = false;
    this.stopHeartbeat();
    
    if (this.webSocket) {
      this.webSocket.close(1000, 'Manual disconnect');
      this.webSocket = null;
    }
  }

  // Event type helpers for TypeScript
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: (info: { code: number; reason: string }) => void): this;
  on(event: 'message_received', listener: (message: RealtimeMessage) => void): this;
  on(event: 'message_sent', listener: (message: RealtimeMessage) => void): this;
  on(event: 'typing_update', listener: (event: TypingEvent) => void): this;
  on(event: 'presence_update', listener: (presence: UserPresence) => void): this;
  on(event: 'delivery_receipt', listener: (receipt: MessageDeliveryReceipt) => void): this;
  on(event: 'error', listener: (error: any) => void): this;
  on(event: 'max_reconnect_attempts_reached', listener: () => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

// Export singleton instance
export const realTimeMessaging = RealTimeMessagingService.getInstance();
export default realTimeMessaging;