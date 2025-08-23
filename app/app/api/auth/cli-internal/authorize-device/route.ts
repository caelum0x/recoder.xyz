/**
 * CLI Internal Device Authorization API
 * Handles device flow authorization from the web interface
 * Internal endpoint called by the device authorization page
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  getDeviceFlowRequestByUserCode, 
  updateDeviceFlowRequest,
  getDeviceFlowRequest 
} from '@/lib/device-flow-storage';

const authorizeDeviceSchema = z.object({
  user_code: z.string().length(8),
  action: z.enum(['authorize', 'deny'])
});

/**
 * POST - Handle device authorization from web interface
 */
export async function POST(request: NextRequest) {
  try {
    // For demo purposes, we'll create a mock user session
    // In production, implement proper session management
    const mockSession = {
      user: {
        id: 'demo_user_' + Math.random().toString(36).substr(2, 9),
        email: 'demo@recoder.xyz',
        name: 'Demo User'
      }
    };
    
    const session = mockSession;

    const body = await request.json();
    const validation = authorizeDeviceSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'invalid_request',
        error_description: 'Invalid request parameters'
      }, { status: 400 });
    }

    const { user_code, action } = validation.data;

    // Find device flow request by user code in database
    const deviceRequest = await getDeviceFlowRequestByUserCode(user_code);

    if (!deviceRequest || deviceRequest.status !== 'pending') {
      return NextResponse.json({
        success: false,
        error: 'invalid_user_code',
        error_description: 'Device code not found or expired'
      }, { status: 404 });
    }

    // Check if request has expired
    if (new Date() > deviceRequest.expires_at) {
      // Update status to expired in database
      await updateDeviceFlowRequest(deviceRequest.device_code, { status: 'expired' });
      
      return NextResponse.json({
        success: false,
        error: 'expired_token',
        error_description: 'Device code has expired'
      }, { status: 400 });
    }

    if (action === 'authorize') {
      // Update device flow request in database
      await updateDeviceFlowRequest(deviceRequest.device_code, {
        status: 'authorized',
        user_id: session.user.id,
        authorized_at: new Date()
      });

      // Create CLI session data for when CLI polls for token
      const mockUser = {
        id: session.user.id,
        email: session.user.email!,
        name: session.user.name || '',
        subscription_plan: 'pro', // This would come from your user database
        quota: {
          requests_remaining: 5000,
          requests_limit: 5000,
          reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      };

      // Store user data for token exchange in database
      await updateDeviceFlowRequest(deviceRequest.device_code, {
        user_data: mockUser
      });

      return NextResponse.json({
        success: true,
        message: 'Device authorized successfully',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name
        }
      });

    } else if (action === 'deny') {
      // Deny the device authorization in database
      await updateDeviceFlowRequest(deviceRequest.device_code, {
        status: 'denied',
        denied_at: new Date()
      });

      return NextResponse.json({
        success: true,
        message: 'Device authorization denied'
      });
    }

  } catch (error: any) {
    console.error('Device authorization error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      error_description: 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * GET - Check device authorization status (for CLI polling)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceCode = searchParams.get('device_code');

    if (!deviceCode) {
      return NextResponse.json({
        success: false,
        error: 'invalid_request',
        error_description: 'Missing device_code parameter'
      }, { status: 400 });
    }

    const deviceRequest = await getDeviceFlowRequest(deviceCode);
    
    if (!deviceRequest) {
      return NextResponse.json({
        success: false,
        error: 'invalid_grant',
        error_description: 'Invalid device code'
      }, { status: 400 });
    }

    // Check if expired
    if (new Date() > deviceRequest.expires_at) {
      await updateDeviceFlowRequest(deviceCode, { status: 'expired' });
      return NextResponse.json({
        success: false,
        error: 'expired_token',
        error_description: 'Device code has expired'
      }, { status: 400 });
    }

    // Return status
    if (deviceRequest.status === 'authorized') {
      // Generate tokens for successful authorization
      const accessToken = `rct_${Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
      const refreshToken = `rcr_${Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Mark device flow request as completed in database
      await updateDeviceFlowRequest(deviceCode, { status: 'completed' });

      return NextResponse.json({
        success: true,
        status: 'authorized',
        user_id: deviceRequest.user_data?.id || deviceRequest.user_id,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt.toISOString(),
        user: deviceRequest.user_data,
        platform_connection: {
          web_session_id: `web_${Date.now()}`,
          last_sync: new Date().toISOString()
        }
      });

    } else if (deviceRequest.status === 'denied') {
      // Mark device flow request as completed in database
      await updateDeviceFlowRequest(deviceCode, { status: 'completed' });
      
      return NextResponse.json({
        success: false,
        error: 'access_denied',
        error_description: 'User denied the authorization request'
      }, { status: 400 });

    } else {
      // Still pending
      return NextResponse.json({
        success: false,
        error: 'authorization_pending',
        error_description: 'User has not yet completed the authorization'
      }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Device status check error:', error);
    return NextResponse.json({
      success: false,
      error: 'server_error',
      error_description: 'Internal server error'
    }, { status: 500 });
  }
}

