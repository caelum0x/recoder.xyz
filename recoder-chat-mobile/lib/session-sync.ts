/**
 * Mobile Session Sync
 * Handles session synchronization between mobile and web platforms
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, User, SyncStatus } from './types';

class SessionSync {
  private syncEndpoint = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
  
  async saveSession(sessionData: any): Promise<void> {
    try {
      await AsyncStorage.setItem('user_session', JSON.stringify(sessionData));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  async loadSession(): Promise<any | null> {
    try {
      const session = await AsyncStorage.getItem('user_session');
      return session ? JSON.parse(session) : null;
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  }

  async clearSession(): Promise<void> {
    try {
      await AsyncStorage.removeItem('user_session');
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }

  async syncToCloud(data: any): Promise<void> {
    try {
      const session = await this.loadSession();
      if (!session?.token) {
        throw new Error('No valid session found');
      }

      const response = await fetch(`${this.syncEndpoint}/api/sync/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error('Sync to cloud failed');
      }
    } catch (error) {
      console.error('Cloud sync failed:', error);
    }
  }

  async syncFromCloud(): Promise<any> {
    try {
      const session = await this.loadSession();
      if (!session?.token) {
        throw new Error('No valid session found');
      }

      const response = await fetch(`${this.syncEndpoint}/api/sync/download`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Sync from cloud failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Cloud sync failed:', error);
      return null;
    }
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const lastSync = await AsyncStorage.getItem('last_sync');
    const pendingChanges = await AsyncStorage.getItem('pending_changes');
    
    return {
      isOnline: true, // Would check actual network status
      lastSync: lastSync || new Date().toISOString(),
      pendingChanges: parseInt(pendingChanges || '0'),
      conflicts: 0
    };
  }

  async markPendingChanges(count: number): Promise<void> {
    await AsyncStorage.setItem('pending_changes', count.toString());
  }

  async updateLastSync(): Promise<void> {
    await AsyncStorage.setItem('last_sync', new Date().toISOString());
  }
}

export const sessionSync = new SessionSync();
export default sessionSync;