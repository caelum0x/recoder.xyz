/**
 * Unified Authentication Service
 * Provides cross-platform authentication for Recoder Web, CLI, Extension, and Router
 */

import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// Types for unified authentication
export interface UnifiedSession {
  userId: string;
  platform: 'web' | 'cli' | 'extension' | 'router';
  deviceId?: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresAt: Date;
  createdAt: Date;
  lastUsed: Date;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, any>;
}

export interface APIKey {
  keyId: string;
  userId: string;
  hashedKey: string;
  scopes: string[];
  restrictions: {
    ipWhitelist?: string[];
    rateLimit: number;
    platforms: string[];
    expiresAt?: Date;
  };
  lastUsed?: Date;
  createdAt: Date;
  active: boolean;
}

export interface DeviceFlowRequest {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
  status: 'pending' | 'authorized' | 'denied' | 'expired';
}

export interface MFAConfig {
  enabled: boolean;
  methods: ('totp' | 'sms' | 'email' | 'security_key')[];
  backupCodes: string[];
  totpSecret?: string;
  securityKeys: Array<{
    id: string;
    name: string;
    publicKey: string;
    createdAt: Date;
  }>;
}

export interface ThreatAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }>;
  requiresMFA: boolean;
  allowAccess: boolean;
  recommendations: string[];
}

export class UnifiedAuthService {
  private readonly JWT_SECRET = process.env.NEXTAUTH_SECRET || 'fallback-secret';
  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY = '7d';
  private readonly DEVICE_CODE_EXPIRY = '15m';
  
  /**
   * Generate a unified access token for cross-platform use
   */
  async generateUnifiedToken(userId: string, platform: string, scopes: string[] = ['basic']): Promise<UnifiedSession> {
    const deviceId = crypto.randomBytes(16).toString('hex');
    const accessToken = jwt.sign(
      {
        userId,
        platform,
        deviceId,
        scopes,
        type: 'access'
      },
      this.JWT_SECRET,
      { expiresIn: this.ACCESS_TOKEN_EXPIRY }
    );
    
    const refreshToken = jwt.sign(
      {
        userId,
        platform,
        deviceId,
        type: 'refresh'
      },
      this.JWT_SECRET,
      { expiresIn: this.REFRESH_TOKEN_EXPIRY }
    );
    
    const session: UnifiedSession = {
      userId,
      platform: platform as any,
      deviceId,
      accessToken,
      refreshToken,
      scopes,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      createdAt: new Date(),
      lastUsed: new Date(),
      riskLevel: 'low',
      metadata: {}
    };
    
    // Store session in database
    await this.storeSession(session);
    
    return session;
  }
  
  /**
   * Validate and decode a unified token
   */
  async validateUnifiedToken(token: string): Promise<UnifiedSession | null> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as any;
      
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      
      // Get session from database
      const session = await this.getSession(decoded.userId, decoded.deviceId);
      if (!session || session.expiresAt < new Date()) {
        return null;
      }
      
      // Update last used
      await this.updateSessionLastUsed(decoded.userId, decoded.deviceId);
      
      return session;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Refresh an expired access token using refresh token
   */
  async refreshUnifiedToken(refreshToken: string): Promise<UnifiedSession | null> {
    try {
      const decoded = jwt.verify(refreshToken, this.JWT_SECRET) as any;
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      
      // Get existing session
      const existingSession = await this.getSession(decoded.userId, decoded.deviceId);
      if (!existingSession) {
        return null;
      }
      
      // Generate new tokens
      return await this.generateUnifiedToken(decoded.userId, decoded.platform, existingSession.scopes);
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Generate API key for programmatic access
   */
  async generateAPIKey(
    userId: string, 
    options: {
      scopes?: string[];
      restrictions?: Partial<APIKey['restrictions']>;
      name?: string;
    } = {}
  ): Promise<{ keyId: string; apiKey: string }> {
    const keyId = crypto.randomBytes(16).toString('hex');
    const rawKey = crypto.randomBytes(32).toString('hex');
    const hashedKey = await bcrypt.hash(rawKey, 12);
    
    const apiKeyData: Omit<APIKey, 'keyId'> = {
      userId,
      hashedKey,
      scopes: options.scopes || ['basic'],
      restrictions: {
        rateLimit: 1000,
        platforms: ['cli', 'extension', 'router'],
        ...options.restrictions
      },
      createdAt: new Date(),
      active: true
    };
    
    // Store in database
    await prisma.apiKey.create({
      data: {
        keyId,
        ...apiKeyData,
        name: options.name || `API Key ${keyId.slice(0, 8)}`,
      }
    });
    
    return {
      keyId,
      apiKey: `rcd_${keyId}_${rawKey}`
    };
  }
  
  /**
   * Validate API key
   */
  async validateAPIKey(apiKey: string): Promise<{ valid: boolean; userId?: string; scopes?: string[]; restrictions?: any }> {
    try {
      const [prefix, keyId, rawKey] = apiKey.split('_');
      
      if (prefix !== 'rcd' || !keyId || !rawKey) {
        return { valid: false };
      }
      
      const storedKey = await prisma.apiKey.findUnique({
        where: { keyId, active: true }
      });
      
      if (!storedKey) {
        return { valid: false };
      }
      
      const isValid = await bcrypt.compare(rawKey, storedKey.hashedKey);
      if (!isValid) {
        return { valid: false };
      }
      
      // Check expiration
      if (storedKey.restrictions.expiresAt && storedKey.restrictions.expiresAt < new Date()) {
        return { valid: false };
      }
      
      // Update last used
      await prisma.apiKey.update({
        where: { keyId },
        data: { lastUsed: new Date() }
      });
      
      return {
        valid: true,
        userId: storedKey.userId,
        scopes: storedKey.scopes,
        restrictions: storedKey.restrictions
      };
    } catch (error) {
      return { valid: false };
    }
  }
  
  /**
   * Initiate device flow for headless authentication
   */
  async initiateDeviceFlow(): Promise<DeviceFlowRequest> {
    const deviceCode = crypto.randomBytes(32).toString('hex');
    const userCode = this.generateUserCode();
    const verificationUri = `${process.env.NEXTAUTH_URL}/auth/device`;
    const verificationUriComplete = `${verificationUri}?user_code=${userCode}`;
    
    const deviceFlow: DeviceFlowRequest = {
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete,
      expiresIn: 900, // 15 minutes
      interval: 5, // 5 seconds
      status: 'pending'
    };
    
    // Store device flow request
    await prisma.deviceFlow.create({
      data: {
        deviceCode,
        userCode,
        status: 'pending',
        expiresAt: new Date(Date.now() + 900000) // 15 minutes
      }
    });
    
    return deviceFlow;
  }
  
  /**
   * Authorize device flow with user consent
   */
  async authorizeDeviceFlow(userCode: string, userId: string): Promise<boolean> {
    const deviceFlow = await prisma.deviceFlow.findFirst({
      where: {
        userCode,
        status: 'pending',
        expiresAt: { gte: new Date() }
      }
    });
    
    if (!deviceFlow) {
      return false;
    }
    
    // Generate tokens for the device
    const session = await this.generateUnifiedToken(userId, 'cli');
    
    // Update device flow status
    await prisma.deviceFlow.update({
      where: { id: deviceFlow.id },
      data: {
        status: 'authorized',
        userId,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken
      }
    });
    
    return true;
  }
  
  /**
   * Poll device authorization status
   */
  async pollDeviceAuthorization(deviceCode: string): Promise<{
    status: 'pending' | 'authorized' | 'denied' | 'expired';
    accessToken?: string;
    refreshToken?: string;
  }> {
    const deviceFlow = await prisma.deviceFlow.findFirst({
      where: { deviceCode }
    });
    
    if (!deviceFlow) {
      return { status: 'expired' };
    }
    
    if (deviceFlow.expiresAt < new Date()) {
      await prisma.deviceFlow.update({
        where: { id: deviceFlow.id },
        data: { status: 'expired' }
      });
      return { status: 'expired' };
    }
    
    if (deviceFlow.status === 'authorized') {
      return {
        status: 'authorized',
        accessToken: deviceFlow.accessToken!,
        refreshToken: deviceFlow.refreshToken!
      };
    }
    
    return { status: deviceFlow.status as any };
  }
  
  /**
   * Assess security risk for authentication request
   */
  async assessThreat(userId: string, context: {
    ip: string;
    userAgent: string;
    platform: string;
    deviceFingerprint?: string;
    location?: { lat: number; lng: number };
  }): Promise<ThreatAssessment> {
    const factors: ThreatAssessment['factors'] = [];
    let riskLevel: ThreatAssessment['riskLevel'] = 'low';
    
    // Check for geographic anomalies
    const lastLocation = await this.getLastUserLocation(userId);
    if (lastLocation && context.location) {
      const distance = this.calculateDistance(lastLocation, context.location);
      if (distance > 1000) { // More than 1000km
        factors.push({
          type: 'geographic_anomaly',
          severity: 'medium',
          description: `Login from ${distance}km away from last location`
        });
        riskLevel = 'medium';
      }
    }
    
    // Check for unknown devices
    const knownDevices = await this.getUserDevices(userId);
    if (context.deviceFingerprint && !knownDevices.includes(context.deviceFingerprint)) {
      factors.push({
        type: 'unknown_device',
        severity: 'high',
        description: 'Login from unrecognized device'
      });
      riskLevel = 'high';
    }
    
    // Check for failed attempts
    const recentFailures = await this.getRecentFailedAttempts(userId);
    if (recentFailures > 3) {
      factors.push({
        type: 'multiple_failures',
        severity: 'critical',
        description: `${recentFailures} failed attempts in last hour`
      });
      riskLevel = 'critical';
    }
    
    // Check for suspicious user agent
    if (this.isSuspiciousUserAgent(context.userAgent)) {
      factors.push({
        type: 'suspicious_user_agent',
        severity: 'medium',
        description: 'Potentially automated or suspicious user agent'
      });
      if (riskLevel === 'low') riskLevel = 'medium';
    }
    
    const requiresMFA = riskLevel === 'high' || riskLevel === 'critical';
    const allowAccess = riskLevel !== 'critical';
    
    return {
      riskLevel,
      factors,
      requiresMFA,
      allowAccess,
      recommendations: this.generateSecurityRecommendations(factors)
    };
  }
  
  /**
   * Setup TOTP for MFA
   */
  async setupTOTP(userId: string): Promise<{ secret: string; qrCode: string; backupCodes: string[] }> {
    const secret = crypto.randomBytes(20).toString('base32');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const qrCode = `otpauth://totp/Recoder:${user.email}?secret=${secret}&issuer=Recoder`;
    const backupCodes = Array.from({ length: 8 }, () => 
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
    
    // Store TOTP configuration
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        totpSecret: secret,
        backupCodes: backupCodes
      }
    });
    
    return { secret, qrCode, backupCodes };
  }
  
  /**
   * Verify TOTP code
   */
  async verifyTOTP(userId: string, code: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user?.totpSecret) {
      return false;
    }
    
    // Implementation would use a TOTP library like `speakeasy`
    // For now, returning placeholder logic
    return code.length === 6 && /^\d+$/.test(code);
  }
  
  // Private helper methods
  private async storeSession(session: UnifiedSession): Promise<void> {
    await prisma.userSession.create({
      data: {
        userId: session.userId,
        deviceId: session.deviceId!,
        platform: session.platform,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        scopes: session.scopes,
        expiresAt: session.expiresAt,
        riskLevel: session.riskLevel,
        metadata: session.metadata
      }
    });
  }
  
  private async getSession(userId: string, deviceId: string): Promise<UnifiedSession | null> {
    const session = await prisma.userSession.findFirst({
      where: { userId, deviceId }
    });
    
    if (!session) return null;
    
    return {
      userId: session.userId,
      platform: session.platform as any,
      deviceId: session.deviceId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      scopes: session.scopes,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      lastUsed: session.lastUsed,
      riskLevel: session.riskLevel as any,
      metadata: session.metadata as any
    };
  }
  
  private async updateSessionLastUsed(userId: string, deviceId: string): Promise<void> {
    await prisma.userSession.updateMany({
      where: { userId, deviceId },
      data: { lastUsed: new Date() }
    });
  }
  
  private generateUserCode(): string {
    // Generate user-friendly 8-character code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
  
  private async getLastUserLocation(userId: string): Promise<{ lat: number; lng: number } | null> {
    // Implementation would fetch from audit logs
    return null;
  }
  
  private async getUserDevices(userId: string): Promise<string[]> {
    const sessions = await prisma.userSession.findMany({
      where: { userId },
      select: { deviceId: true }
    });
    return sessions.map(s => s.deviceId);
  }
  
  private async getRecentFailedAttempts(userId: string): Promise<number> {
    // Implementation would check audit logs for failed attempts in last hour
    return 0;
  }
  
  private calculateDistance(point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(point2.lat - point1.lat);
    const dLng = this.deg2rad(point2.lng - point1.lng);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(point1.lat)) * Math.cos(this.deg2rad(point2.lat)) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }
  
  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /curl/i,
      /wget/i,
      /python/i
    ];
    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }
  
  private generateSecurityRecommendations(factors: ThreatAssessment['factors']): string[] {
    const recommendations: string[] = [];
    
    if (factors.some(f => f.type === 'unknown_device')) {
      recommendations.push('Enable device notifications for new logins');
    }
    
    if (factors.some(f => f.type === 'geographic_anomaly')) {
      recommendations.push('Set up trusted locations in your security settings');
    }
    
    if (factors.some(f => f.type === 'multiple_failures')) {
      recommendations.push('Change your password immediately');
      recommendations.push('Review recent account activity');
    }
    
    if (factors.length > 0) {
      recommendations.push('Enable two-factor authentication for enhanced security');
    }
    
    return recommendations;
  }
}

// Export singleton instance
export const unifiedAuth = new UnifiedAuthService();