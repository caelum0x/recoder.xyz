/**
 * User types and interfaces
 */

import { Timestamp } from './common';

export enum UserRole {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
  ADMIN = 'admin'
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification'
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  preferences: UserPreferences;
  subscription?: UserSubscription;
  usage: UserUsage;
  profile: UserProfile;
  timestamps: Timestamp;
}

export interface UserPreferences {
  defaultModel: string;
  codeStyle: CodeStyle;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  integrations: IntegrationPreferences;
}

export interface CodeStyle {
  language: string;
  framework: string;
  indentation: 'spaces' | 'tabs';
  indentationSize: number;
  lineLength: number;
  semicolons: boolean;
  quotes: 'single' | 'double';
  trailingCommas: boolean;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  webhooks: boolean;
  codeGeneration: boolean;
  planningUpdates: boolean;
  agentActivities: boolean;
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'private' | 'restricted';
  projectVisibility: 'public' | 'private' | 'team';
  analyticsOptOut: boolean;
  dataRetention: number; // days
}

export interface IntegrationPreferences {
  githubUsername?: string;
  preferredCloudProvider: 'aws' | 'gcp' | 'azure' | 'vercel' | 'netlify';
  defaultDatabase: 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'supabase';
  deploymentTarget: 'docker' | 'serverless' | 'traditional' | 'kubernetes';
}

export interface UserSubscription {
  planId: string;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;
}

export interface UserUsage {
  codeGenerations: {
    used: number;
    limit: number;
    resetDate: string;
  };
  agentInteractions: {
    used: number;
    limit: number;
    resetDate: string;
  };
  projectsCreated: {
    used: number;
    limit: number;
  };
  storageUsed: {
    bytes: number;
    limit: number;
  };
  apiCalls: {
    used: number;
    limit: number;
    resetDate: string;
  };
}

export interface UserProfile {
  bio?: string;
  company?: string;
  location?: string;
  website?: string;
  github?: string;
  linkedin?: string;
  skills: string[];
  experience: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  focusAreas: string[];
}

export interface CreateUserRequest {
  email: string;
  username: string;
  password: string;
  displayName: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  referralCode?: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  avatar?: string;
  preferences?: Partial<UserPreferences>;
  profile?: Partial<UserProfile>;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
  twoFactorCode?: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}