/**
 * Device Flow Storage
 * Production database integration for device flow requests
 */

import { db } from './database';

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
    const deviceFlow = await db.createDeviceFlow({
      device_code: deviceCode,
      user_code: data.user_code,
      client_id: data.client_id,
      scope: data.scope,
      status: 'pending',
      expires_at: data.expires_at
    });
    return deviceFlow;
  } catch (error) {
    console.error('Failed to initialize device flow request:', error);
    throw error;
  }
}

// Get device flow request from database
export async function getDeviceFlowRequest(deviceCode: string) {
  try {
    return await db.getDeviceFlow(deviceCode);
  } catch (error) {
    console.error('Failed to get device flow request:', error);
    return null;
  }
}

// Update device flow request status
export async function updateDeviceFlowRequest(deviceCode: string, updates: Partial<DeviceFlowRequest>) {
  try {
    return await db.updateDeviceFlow(deviceCode, updates);
  } catch (error) {
    console.error('Failed to update device flow request:', error);
    throw error;
  }
}

// Get device flow request by user code
export async function getDeviceFlowRequestByUserCode(userCode: string) {
  try {
    return await db.getDeviceFlowByUserCode(userCode);
  } catch (error) {
    console.error('Failed to get device flow request by user code:', error);
    return null;
  }
}

// Delete expired device flow requests
export async function cleanupExpiredDeviceFlows() {
  try {
    const now = new Date();
    // Implementation would depend on your database schema
    console.log('Cleaning up expired device flows older than:', now);
    // This should be implemented as a background job
  } catch (error) {
    console.error('Failed to cleanup expired device flows:', error);
  }
}