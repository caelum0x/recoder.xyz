/**
 * Mobile App Types
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  metadata?: Record<string, any>;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  status: 'available' | 'unavailable';
  description?: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  specialties: string[];
  model?: string;
  avatar?: string;
  isActive: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  language: string;
  files: CodeFile[];
  createdAt: string;
  updatedAt: string;
}

export interface CodeFile {
  id: string;
  name: string;
  content: string;
  language: string;
  path: string;
  size: number;
  lastModified: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: boolean;
  localAI: boolean;
  preferredModels: string[];
}

export interface SyncStatus {
  isOnline: boolean;
  lastSync: string;
  pendingChanges: number;
  conflicts: number;
}