/**
 * Mobile-Specific Features
 * Voice input, camera integration, push notifications, and native features
 */

import { Platform, Alert, Linking } from 'react-native';
// Optional imports for advanced features
let check: any;
let request: any;
let PERMISSIONS: any;
let RESULTS: any;
let Voice: any;
let launchCamera: any;
let launchImageLibrary: any;
let PushNotification: any;

try {
  const permissions = require('react-native-permissions');
  check = permissions.check;
  request = permissions.request;
  PERMISSIONS = permissions.PERMISSIONS;
  RESULTS = permissions.RESULTS;
} catch (e) {
  console.log('react-native-permissions not available');
}

try {
  Voice = require('@react-native-voice/voice').default;
} catch (e) {
  console.log('@react-native-voice/voice not available');
}

try {
  const imagePicker = require('react-native-image-picker');
  launchCamera = imagePicker.launchCamera;
  launchImageLibrary = imagePicker.launchImageLibrary;
} catch (e) {
  console.log('react-native-image-picker not available');
}

try {
  PushNotification = require('react-native-push-notification').default;
} catch (e) {
  console.log('react-native-push-notification not available');
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dualPlatformClient } from './DualPlatformClient';

interface ImagePickerResponse {
  assets?: Array<{
    uri: string;
    type?: string;
    fileName?: string;
    fileSize?: number;
    base64?: string;
  }>;
  didCancel?: boolean;
  errorMessage?: string;
}

export interface VoiceConfig {
  enabled: boolean;
  language: string;
  continuous: boolean;
  interimResults: boolean;
}

export interface CameraConfig {
  quality: number;
  maxWidth: number;
  maxHeight: number;
  includeBase64: boolean;
}

export interface NotificationConfig {
  enabled: boolean;
  sound: boolean;
  vibration: boolean;
  priority: 'default' | 'high' | 'max';
}

export interface CodeScanResult {
  code: string;
  language: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export class MobileFeatures {
  private static instance: MobileFeatures;
  private voiceConfig: VoiceConfig = {
    enabled: false,
    language: 'en-US',
    continuous: false,
    interimResults: true,
  };
  private cameraConfig: CameraConfig = {
    quality: 0.8,
    maxWidth: 1024,
    maxHeight: 1024,
    includeBase64: false,
  };
  private notificationConfig: NotificationConfig = {
    enabled: true,
    sound: true,
    vibration: true,
    priority: 'high',
  };
  
  private isVoiceActive = false;
  private voiceCallbacks: {
    onResult?: (result: string) => void;
    onError?: (error: string) => void;
    onStart?: () => void;
    onEnd?: () => void;
  } = {};

  private constructor() {
    this.initializeVoice();
    this.initializeNotifications();
    this.loadConfigurations();
  }

  static getInstance(): MobileFeatures {
    if (!MobileFeatures.instance) {
      MobileFeatures.instance = new MobileFeatures();
    }
    return MobileFeatures.instance;
  }

  /**
   * Voice Input Features
   */
  private initializeVoice(): void {
    if (!Voice) return;
    
    Voice.onSpeechStart = this.onSpeechStart.bind(this);
    Voice.onSpeechEnd = this.onSpeechEnd.bind(this);
    Voice.onSpeechResults = this.onSpeechResults.bind(this);
    Voice.onSpeechPartialResults = this.onSpeechPartialResults.bind(this);
    Voice.onSpeechError = this.onSpeechError.bind(this);
  }

  async requestMicrophonePermission(): Promise<boolean> {
    if (!check || !PERMISSIONS || !RESULTS) {
      console.log('Permissions module not available');
      return false;
    }
    
    try {
      const permission = Platform.OS === 'ios' 
        ? PERMISSIONS.IOS.MICROPHONE 
        : PERMISSIONS.ANDROID.RECORD_AUDIO;

      const result = await check(permission);
      
      if (result === RESULTS.GRANTED) {
        return true;
      }
      
      if (result === RESULTS.DENIED) {
        const requestResult = await request(permission);
        return requestResult === RESULTS.GRANTED;
      }
      
      if (result === RESULTS.BLOCKED) {
        Alert.alert(
          'Microphone Permission',
          'Please enable microphone access in settings to use voice input.',
          [
            { text: 'Cancel' },
            { text: 'Settings', onPress: () => Linking.openSettings() }
          ]
        );
        return false;
      }
      
      return false;
    } catch (error) {
      console.error('Error requesting microphone permission:', error);
      return false;
    }
  }

  async startVoiceRecognition(callbacks: {
    onResult?: (result: string) => void;
    onError?: (error: string) => void;
    onStart?: () => void;
    onEnd?: () => void;
  } = {}): Promise<boolean> {
    if (!this.voiceConfig.enabled) {
      callbacks.onError?.('Voice recognition is disabled');
      return false;
    }

    const hasPermission = await this.requestMicrophonePermission();
    if (!hasPermission) {
      callbacks.onError?.('Microphone permission denied');
      return false;
    }

    try {
      this.voiceCallbacks = callbacks;
      
      const available = await Voice.isAvailable();
      if (!available) {
        callbacks.onError?.('Voice recognition not available');
        return false;
      }

      await Voice.start(this.voiceConfig.language);
      this.isVoiceActive = true;
      return true;
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      callbacks.onError?.(error.message);
      return false;
    }
  }

  async stopVoiceRecognition(): Promise<void> {
    try {
      await Voice.stop();
      this.isVoiceActive = false;
    } catch (error) {
      console.error('Error stopping voice recognition:', error);
    }
  }

  private onSpeechStart(): void {
    this.voiceCallbacks.onStart?.();
  }

  private onSpeechEnd(): void {
    this.isVoiceActive = false;
    this.voiceCallbacks.onEnd?.();
  }

  private onSpeechResults(event: any): void {
    const result = event.value?.[0];
    if (result) {
      this.voiceCallbacks.onResult?.(result);
    }
  }

  private onSpeechPartialResults(event: any): void {
    if (this.voiceConfig.interimResults) {
      const result = event.value?.[0];
      if (result) {
        this.voiceCallbacks.onResult?.(result);
      }
    }
  }

  private onSpeechError(event: any): void {
    this.isVoiceActive = false;
    this.voiceCallbacks.onError?.(event.error?.message || 'Speech recognition error');
  }

  /**
   * Camera Integration Features
   */
  async requestCameraPermission(): Promise<boolean> {
    try {
      const permission = Platform.OS === 'ios' 
        ? PERMISSIONS.IOS.CAMERA 
        : PERMISSIONS.ANDROID.CAMERA;

      const result = await check(permission);
      
      if (result === RESULTS.GRANTED) {
        return true;
      }
      
      if (result === RESULTS.DENIED) {
        const requestResult = await request(permission);
        return requestResult === RESULTS.GRANTED;
      }
      
      if (result === RESULTS.BLOCKED) {
        Alert.alert(
          'Camera Permission',
          'Please enable camera access in settings to scan code.',
          [
            { text: 'Cancel' },
            { text: 'Settings', onPress: () => Linking.openSettings() }
          ]
        );
        return false;
      }
      
      return false;
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      return false;
    }
  }

  async captureCode(): Promise<{ success: boolean; image?: string; error?: string }> {
    const hasPermission = await this.requestCameraPermission();
    if (!hasPermission) {
      return { success: false, error: 'Camera permission denied' };
    }

    return new Promise((resolve) => {
      const options = {
        mediaType: 'photo' as const,
        quality: this.cameraConfig.quality,
        maxWidth: this.cameraConfig.maxWidth,
        maxHeight: this.cameraConfig.maxHeight,
        includeBase64: this.cameraConfig.includeBase64,
      };

      launchCamera(options, (response: ImagePickerResponse) => {
        if (response.didCancel) {
          resolve({ success: false, error: 'User cancelled' });
        } else if (response.errorMessage) {
          resolve({ success: false, error: response.errorMessage });
        } else if (response.assets?.[0]) {
          const asset = response.assets[0];
          resolve({ 
            success: true, 
            image: asset.uri || (asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : undefined)
          });
        } else {
          resolve({ success: false, error: 'No image captured' });
        }
      });
    });
  }

  async selectImageFromLibrary(): Promise<{ success: boolean; image?: string; error?: string }> {
    return new Promise((resolve) => {
      const options = {
        mediaType: 'photo' as const,
        quality: this.cameraConfig.quality,
        maxWidth: this.cameraConfig.maxWidth,
        maxHeight: this.cameraConfig.maxHeight,
        includeBase64: this.cameraConfig.includeBase64,
      };

      launchImageLibrary(options, (response: ImagePickerResponse) => {
        if (response.didCancel) {
          resolve({ success: false, error: 'User cancelled' });
        } else if (response.errorMessage) {
          resolve({ success: false, error: response.errorMessage });
        } else if (response.assets?.[0]) {
          const asset = response.assets[0];
          resolve({ 
            success: true, 
            image: asset.uri || (asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : undefined)
          });
        } else {
          resolve({ success: false, error: 'No image selected' });
        }
      });
    });
  }

  async scanCodeFromImage(imageUri: string): Promise<CodeScanResult[]> {
    try {
      // This would integrate with a code scanning library like ML Kit
      // For now, return a placeholder result
      
      // In a real implementation, you would:
      // 1. Use Google ML Kit or similar to detect text
      // 2. Parse the detected text to identify code
      // 3. Determine the programming language
      // 4. Return structured results
      
      return [
        {
          code: '// Scanned code would appear here\nfunction example() {\n  console.log("Hello from scanned code!");\n}',
          language: 'javascript',
          confidence: 0.8,
          boundingBox: { x: 100, y: 100, width: 400, height: 200 }
        }
      ];
    } catch (error) {
      console.error('Error scanning code from image:', error);
      return [];
    }
  }

  /**
   * Push Notifications
   */
  private initializeNotifications(): void {
    if (!PushNotification) {
      console.log('Push notifications not available');
      return;
    }
    
    PushNotification.configure({
      onRegister: (token) => {
        console.log('Push notification token:', token);
        this.registerDeviceToken(token.token);
      },
      
      onNotification: (notification) => {
        console.log('Push notification received:', notification);
        this.handleNotification(notification);
      },
      
      onAction: (notification) => {
        console.log('Push notification action:', notification);
      },
      
      onRegistrationError: (err) => {
        console.error('Push notification registration error:', err);
      },
      
      permissions: {
        alert: true,
        badge: true,
        sound: true,
      },
      
      popInitialNotification: true,
      requestPermissions: Platform.OS === 'ios',
    });
  }

  private async registerDeviceToken(token: string): Promise<void> {
    try {
      // Register device token with your backend
      // await dualPlatformClient.registerDeviceToken(token);
      console.log('Device token registered:', token);
    } catch (error) {
      console.error('Failed to register device token:', error);
    }
  }

  private handleNotification(notification: any): void {
    // Handle different types of notifications
    switch (notification.data?.type) {
      case 'chat_message':
        this.handleChatNotification(notification);
        break;
      case 'project_update':
        this.handleProjectNotification(notification);
        break;
      case 'deployment_status':
        this.handleDeploymentNotification(notification);
        break;
      default:
        console.log('Unknown notification type:', notification);
    }
  }

  private handleChatNotification(notification: any): void {
    // Navigate to chat or show in-app notification
    console.log('Chat notification received:', notification);
  }

  private handleProjectNotification(notification: any): void {
    // Navigate to project or show update
    console.log('Project notification received:', notification);
  }

  private handleDeploymentNotification(notification: any): void {
    // Show deployment status
    console.log('Deployment notification received:', notification);
  }

  async sendLocalNotification(title: string, message: string, data?: any): Promise<void> {
    if (!this.notificationConfig.enabled) return;

    PushNotification.localNotification({
      title,
      message,
      playSound: this.notificationConfig.sound,
      vibrate: this.notificationConfig.vibration,
      priority: this.notificationConfig.priority,
      userInfo: data,
      channelId: 'recoder-channel',
    });
  }

  /**
   * Haptic Feedback
   */
  async triggerHapticFeedback(type: 'light' | 'medium' | 'heavy' = 'medium'): Promise<void> {
    try {
      // This would use react-native-haptic-feedback
      // HapticFeedback.trigger(type);
      console.log(`Haptic feedback: ${type}`);
    } catch (error) {
      console.error('Haptic feedback error:', error);
    }
  }

  /**
   * Device Info and Capabilities
   */
  async getDeviceCapabilities(): Promise<{
    hasCamera: boolean;
    hasMicrophone: boolean;
    hasNotifications: boolean;
    hasHaptics: boolean;
    platform: string;
    version: string;
  }> {
    return {
      hasCamera: true, // Would check actual capability
      hasMicrophone: true,
      hasNotifications: true,
      hasHaptics: Platform.OS === 'ios' || (typeof Platform.Version === 'number' && Platform.Version >= 21),
      platform: Platform.OS,
      version: Platform.Version.toString(),
    };
  }

  /**
   * Configuration Management
   */
  async updateVoiceConfig(config: Partial<VoiceConfig>): Promise<void> {
    this.voiceConfig = { ...this.voiceConfig, ...config };
    await this.saveConfiguration();
  }

  async updateCameraConfig(config: Partial<CameraConfig>): Promise<void> {
    this.cameraConfig = { ...this.cameraConfig, ...config };
    await this.saveConfiguration();
  }

  async updateNotificationConfig(config: Partial<NotificationConfig>): Promise<void> {
    this.notificationConfig = { ...this.notificationConfig, ...config };
    await this.saveConfiguration();
  }

  private async loadConfigurations(): Promise<void> {
    try {
      const voiceConfig = await AsyncStorage.getItem('voice-config');
      if (voiceConfig) {
        this.voiceConfig = { ...this.voiceConfig, ...JSON.parse(voiceConfig) };
      }

      const cameraConfig = await AsyncStorage.getItem('camera-config');
      if (cameraConfig) {
        this.cameraConfig = { ...this.cameraConfig, ...JSON.parse(cameraConfig) };
      }

      const notificationConfig = await AsyncStorage.getItem('notification-config');
      if (notificationConfig) {
        this.notificationConfig = { ...this.notificationConfig, ...JSON.parse(notificationConfig) };
      }
    } catch (error) {
      console.error('Error loading configurations:', error);
    }
  }

  private async saveConfiguration(): Promise<void> {
    try {
      await AsyncStorage.setItem('voice-config', JSON.stringify(this.voiceConfig));
      await AsyncStorage.setItem('camera-config', JSON.stringify(this.cameraConfig));
      await AsyncStorage.setItem('notification-config', JSON.stringify(this.notificationConfig));
    } catch (error) {
      console.error('Error saving configurations:', error);
    }
  }

  getConfigurations(): {
    voice: VoiceConfig;
    camera: CameraConfig;
    notifications: NotificationConfig;
  } {
    return {
      voice: { ...this.voiceConfig },
      camera: { ...this.cameraConfig },
      notifications: { ...this.notificationConfig },
    };
  }

  isVoiceRecognitionActive(): boolean {
    return this.isVoiceActive;
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.isVoiceActive) {
      await this.stopVoiceRecognition();
    }
    
    Voice.destroy();
    await this.saveConfiguration();
  }
}

// Export singleton instance
export const mobileFeatures = MobileFeatures.getInstance();

// Export convenience functions
export const startVoiceInput = (callbacks: any) => 
  mobileFeatures.startVoiceRecognition(callbacks);

export const stopVoiceInput = () => 
  mobileFeatures.stopVoiceRecognition();

export const captureCode = () => 
  mobileFeatures.captureCode();

export const scanCodeFromImage = (imageUri: string) => 
  mobileFeatures.scanCodeFromImage(imageUri);

export const sendNotification = (title: string, message: string, data?: any) => 
  mobileFeatures.sendLocalNotification(title, message, data);

export const triggerHaptic = (type?: 'light' | 'medium' | 'heavy') => 
  mobileFeatures.triggerHapticFeedback(type);

export const getDeviceCapabilities = () => 
  mobileFeatures.getDeviceCapabilities();