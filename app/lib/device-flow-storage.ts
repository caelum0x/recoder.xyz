/**
 * Device Flow Storage
 * Production database integration for device flow requests using Prisma
 */

import { prisma } from './prisma';
import { logger } from '@/lib/logger';

export interface DeviceFlowRequest {
  device_code: string;
  user_code: string;
  client_id: string;
  scope: string;
  status: 'pending' | 'authorized' | 'denied' | 'expired' | 'completed';
  expires_at: Date;
  created_at: Date;
  authorized_at?: Date;
  denied_at?: Date;
  user_id?: string;
  user_data?: any;
}

// Initialize device flow request in database
export async function initializeDeviceFlowRequest(deviceCode: string, data: DeviceFlowRequest) {
  try {
    const deviceFlow = await prisma.deviceCode.create({
      data: {
        deviceCode: deviceCode,
        userCode: data.user_code,
        clientId: data.client_id,
        scope: data.scope,
        status: 'pending',
        expiresAt: data.expires_at
      }
    });

    // Return in expected format
    return {
      device_code: deviceFlow.deviceCode,
      user_code: deviceFlow.userCode,
      client_id: deviceFlow.clientId,
      scope: deviceFlow.scope || '',
      status: deviceFlow.status as DeviceFlowRequest['status'],
      expires_at: deviceFlow.expiresAt,
      created_at: deviceFlow.createdAt,
      user_id: deviceFlow.userId || undefined
    };
  } catch (error) {
    logger.error('Failed to initialize device flow request', { error: String(error) });
    throw error;
  }
}

// Get device flow request from database
export async function getDeviceFlowRequest(deviceCode: string): Promise<DeviceFlowRequest | null> {
  try {
    const flow = await prisma.deviceCode.findUnique({
      where: { deviceCode },
      include: { user: true }
    });

    if (!flow) return null;

    return {
      device_code: flow.deviceCode,
      user_code: flow.userCode,
      client_id: flow.clientId,
      scope: flow.scope || '',
      status: flow.status as DeviceFlowRequest['status'],
      expires_at: flow.expiresAt,
      created_at: flow.createdAt,
      user_id: flow.userId || undefined,
      user_data: flow.user ? {
        id: flow.user.id,
        email: flow.user.email,
        name: flow.user.name,
        subscription_plan: flow.user.subscriptionPlan || 'free'
      } : undefined
    };
  } catch (error) {
    logger.error('Failed to get device flow request', { error: String(error) });
    return null;
  }
}

// Update device flow request status
export async function updateDeviceFlowRequest(deviceCode: string, updates: Partial<DeviceFlowRequest>) {
  try {
    const data: any = {};

    if (updates.status) data.status = updates.status;
    if (updates.user_id) data.userId = updates.user_id;
    if (updates.authorized_at) data.createdAt = updates.authorized_at; // No dedicated field, use createdAt

    const flow = await prisma.deviceCode.update({
      where: { deviceCode },
      data,
      include: { user: true }
    });

    return {
      device_code: flow.deviceCode,
      user_code: flow.userCode,
      client_id: flow.clientId,
      scope: flow.scope || '',
      status: flow.status as DeviceFlowRequest['status'],
      expires_at: flow.expiresAt,
      created_at: flow.createdAt,
      user_id: flow.userId || undefined,
      user_data: flow.user ? {
        id: flow.user.id,
        email: flow.user.email,
        name: flow.user.name,
        subscription_plan: flow.user.subscriptionPlan || 'free'
      } : undefined
    };
  } catch (error) {
    logger.error('Failed to update device flow request', { error: String(error) });
    throw error;
  }
}

// Get device flow request by user code
export async function getDeviceFlowRequestByUserCode(userCode: string): Promise<DeviceFlowRequest | null> {
  try {
    // Handle both formats: with or without hyphen
    const normalizedCode = userCode.replace('-', '');

    const flow = await prisma.deviceCode.findFirst({
      where: {
        OR: [
          { userCode: userCode },
          { userCode: normalizedCode },
          { userCode: { contains: normalizedCode } }
        ]
      },
      include: { user: true }
    });

    if (!flow) return null;

    return {
      device_code: flow.deviceCode,
      user_code: flow.userCode,
      client_id: flow.clientId,
      scope: flow.scope || '',
      status: flow.status as DeviceFlowRequest['status'],
      expires_at: flow.expiresAt,
      created_at: flow.createdAt,
      user_id: flow.userId || undefined,
      user_data: flow.user ? {
        id: flow.user.id,
        email: flow.user.email,
        name: flow.user.name,
        subscription_plan: flow.user.subscriptionPlan || 'free'
      } : undefined
    };
  } catch (error) {
    logger.error('Failed to get device flow request by user code', { error: String(error) });
    return null;
  }
}

// Delete expired device flow requests
export async function cleanupExpiredDeviceFlows() {
  try {
    const result = await prisma.deviceCode.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
    logger.info('Cleaned up expired device flows', { count: String(result.count) });
    return result.count;
  } catch (error) {
    logger.error('Failed to cleanup expired device flows', { error: String(error) });
    return 0;
  }
}
