import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Camera from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Network from 'expo-network';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

// Secure storage service
export class SecureStorageService {
  static async store(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('Secure storage error:', error);
      throw new Error('Failed to store secure data');
    }
  }

  static async retrieve(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('Secure retrieval error:', error);
      return null;
    }
  }

  static async remove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('Secure removal error:', error);
    }
  }

  static async clear(): Promise<void> {
    try {
      // Clear all auth-related keys
      const keysToRemove = [
        'auth_token',
        'refresh_token',
        'user_data',
        'device_id',
        'biometric_enabled'
      ];
      
      await Promise.all(keysToRemove.map(key => this.remove(key)));
    } catch (error) {
      console.error('Secure clear error:', error);
    }
  }
}

// Push notifications service
export class PushNotificationService {
  static async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus === 'granted') {
        // Configure notifications
        await this.configureNotifications();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Push notification permission error:', error);
      return false;
    }
  }

  static async configureNotifications(): Promise<void> {
    await Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    // Set notification categories for interactive notifications
    await Notifications.setNotificationCategoryAsync('code-generation', [
      {
        identifier: 'view',
        buttonTitle: 'View Code',
        options: { opensAppToForeground: true }
      },
      {
        identifier: 'dismiss',
        buttonTitle: 'Dismiss',
        options: { opensAppToForeground: false }
      }
    ]);

    await Notifications.setNotificationCategoryAsync('project-update', [
      {
        identifier: 'open-project',
        buttonTitle: 'Open Project',
        options: { opensAppToForeground: true }
      }
    ]);
  }

  static async getExpoPushToken(): Promise<string | null> {
    try {
      if (!Device.isDevice) {
        console.warn('Push notifications require a physical device');
        return null;
      }

      const token = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PROJECT_ID || 'your-expo-project-id'
      });

      return token.data;
    } catch (error) {
      console.error('Get push token error:', error);
      return null;
    }
  }

  static async schedulePersistentNotification(
    title: string,
    body: string,
    data?: any,
    triggerDate?: Date
  ): Promise<string | null> {
    try {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          categoryIdentifier: data?.category || 'default'
        },
        trigger: triggerDate ? { date: triggerDate } : null
      });

      return identifier;
    } catch (error) {
      console.error('Schedule notification error:', error);
      return null;
    }
  }

  static async cancelNotification(identifier: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch (error) {
      console.error('Cancel notification error:', error);
    }
  }

  static async setBadgeCount(count: number): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('Set badge count error:', error);
    }
  }
}

// Camera service
export class CameraService {
  static async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Camera permission error:', error);
      return false;
    }
  }

  static async takePicture(): Promise<string | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        throw new Error('Camera permission denied');
      }

      // This would integrate with a camera component
      // For now, return a placeholder
      return 'camera://photo-uri';
    } catch (error) {
      console.error('Take picture error:', error);
      return null;
    }
  }

  static async pickImageFromLibrary(): Promise<string | null> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Media library permission denied');
      }

      // This would open image picker
      return 'library://image-uri';
    } catch (error) {
      console.error('Pick image error:', error);
      return null;
    }
  }
}

// File system service
export class FileSystemService {
  static async createDirectory(path: string): Promise<void> {
    try {
      const dirPath = `${FileSystem.documentDirectory}${path}`;
      const dirInfo = await FileSystem.getInfoAsync(dirPath);
      
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
      }
    } catch (error) {
      console.error('Create directory error:', error);
      throw new Error('Failed to create directory');
    }
  }

  static async writeFile(path: string, content: string): Promise<void> {
    try {
      const filePath = `${FileSystem.documentDirectory}${path}`;
      await FileSystem.writeAsStringAsync(filePath, content);
    } catch (error) {
      console.error('Write file error:', error);
      throw new Error('Failed to write file');
    }
  }

  static async readFile(path: string): Promise<string> {
    try {
      const filePath = `${FileSystem.documentDirectory}${path}`;
      return await FileSystem.readAsStringAsync(filePath);
    } catch (error) {
      console.error('Read file error:', error);
      throw new Error('Failed to read file');
    }
  }

  static async deleteFile(path: string): Promise<void> {
    try {
      const filePath = `${FileSystem.documentDirectory}${path}`;
      await FileSystem.deleteAsync(filePath);
    } catch (error) {
      console.error('Delete file error:', error);
      throw new Error('Failed to delete file');
    }
  }

  static async getFileInfo(path: string): Promise<FileSystem.FileInfo> {
    try {
      const filePath = `${FileSystem.documentDirectory}${path}`;
      return await FileSystem.getInfoAsync(filePath);
    } catch (error) {
      console.error('Get file info error:', error);
      throw new Error('Failed to get file info');
    }
  }

  static async pickDocument(): Promise<{ uri: string; name: string; type: string } | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/json', 'application/javascript'],
        copyToCacheDirectory: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        return {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'unknown'
        };
      }

      return null;
    } catch (error) {
      console.error('Pick document error:', error);
      return null;
    }
  }

  static async exportFile(path: string, content: string): Promise<boolean> {
    try {
      const filePath = `${FileSystem.documentDirectory}${path}`;
      await FileSystem.writeAsStringAsync(filePath, content);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Export file error:', error);
      return false;
    }
  }
}

// Haptic feedback service
export class HapticService {
  static light(): void {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('Light haptic error:', error);
    }
  }

  static medium(): void {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error('Medium haptic error:', error);
    }
  }

  static heavy(): void {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (error) {
      console.error('Heavy haptic error:', error);
    }
  }

  static success(): void {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Success haptic error:', error);
    }
  }

  static warning(): void {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (error) {
      console.error('Warning haptic error:', error);
    }
  }

  static error(): void {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (error) {
      console.error('Error haptic error:', error);
    }
  }
}

// Device information service
export class DeviceService {
  static getDeviceInfo() {
    return {
      platform: Platform.OS,
      version: Platform.Version,
      deviceId: Device.osInternalBuildId,
      deviceName: Device.deviceName,
      model: Device.modelName,
      brand: Device.brand,
      manufacturer: Device.manufacturer,
      osName: Device.osName,
      osVersion: Device.osVersion,
      isDevice: Device.isDevice,
      isTablet: Device.deviceType === Device.DeviceType.TABLET,
      appVersion: Application.nativeApplicationVersion,
      buildVersion: Application.nativeBuildVersion
    };
  }

  static async getNetworkInfo() {
    try {
      const networkState = await NetInfo.fetch();
      return {
        isConnected: networkState.isConnected,
        type: networkState.type,
        isInternetReachable: networkState.isInternetReachable,
        details: networkState.details
      };
    } catch (error) {
      console.error('Get network info error:', error);
      return {
        isConnected: false,
        type: 'unknown',
        isInternetReachable: false,
        details: null
      };
    }
  }

  static async isOnline(): Promise<boolean> {
    try {
      const networkState = await NetInfo.fetch();
      return networkState.isConnected === true && networkState.isInternetReachable === true;
    } catch (error) {
      console.error('Check online status error:', error);
      return false;
    }
  }
}

// Clipboard service
export class ClipboardService {
  static async copy(text: string): Promise<void> {
    try {
      await Clipboard.setStringAsync(text);
      HapticService.light();
    } catch (error) {
      console.error('Clipboard copy error:', error);
      throw new Error('Failed to copy to clipboard');
    }
  }

  static async paste(): Promise<string> {
    try {
      return await Clipboard.getStringAsync();
    } catch (error) {
      console.error('Clipboard paste error:', error);
      return '';
    }
  }

  static async hasString(): Promise<boolean> {
    try {
      return await Clipboard.hasStringAsync();
    } catch (error) {
      console.error('Clipboard check error:', error);
      return false;
    }
  }
}

// Biometric authentication service
export class BiometricService {
  static async isAvailable(): Promise<boolean> {
    try {
      // This would integrate with expo-local-authentication
      // For now, return based on device capabilities
      return Device.isDevice && Platform.OS !== 'web';
    } catch (error) {
      console.error('Biometric availability error:', error);
      return false;
    }
  }

  static async authenticate(reason: string): Promise<boolean> {
    try {
      // This would integrate with expo-local-authentication
      // For now, return success for development
      return true;
    } catch (error) {
      console.error('Biometric authentication error:', error);
      return false;
    }
  }

  static async getSupportedTypes(): Promise<string[]> {
    try {
      // This would return actual biometric types
      return ['fingerprint', 'face'];
    } catch (error) {
      console.error('Get biometric types error:', error);
      return [];
    }
  }
}

// Network monitoring service
export class NetworkMonitoringService {
  private static listeners: ((isOnline: boolean) => void)[] = [];

  static startMonitoring(): void {
    NetInfo.addEventListener(state => {
      const isOnline = state.isConnected === true && state.isInternetReachable === true;
      this.notifyListeners(isOnline);
    });
  }

  static addListener(callback: (isOnline: boolean) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private static notifyListeners(isOnline: boolean): void {
    this.listeners.forEach(callback => {
      try {
        callback(isOnline);
      } catch (error) {
        console.error('Network listener error:', error);
      }
    });
  }
}

// Export all services
export {
  SecureStorageService,
  PushNotificationService,
  CameraService,
  FileSystemService,
  HapticService,
  DeviceService,
  ClipboardService,
  BiometricService,
  NetworkMonitoringService
};