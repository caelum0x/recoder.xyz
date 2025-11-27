import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verify } from 'jsonwebtoken';
import crypto from 'crypto';
import { nanoid } from 'nanoid';

const JWT_SECRET = process.env.JWT_SECRET!;
const ENCRYPTION_SECRET = process.env.API_KEY_ENCRYPTION_SECRET!;

async function authenticateRequest(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing authorization header');
  }
  const token = authHeader.substring(7);
  const decoded = verify(token, JWT_SECRET) as any;
  return decoded.userId;
}

function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_SECRET, 'hex'), iv);
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

async function validateOpenRouterKey(apiKey: string): Promise<boolean> {
  try {
    // Test the API key with OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await authenticateRequest(request);
    const { apiKey } = await request.json();

    if (!apiKey || !apiKey.startsWith('sk-or-v1-')) {
      return NextResponse.json(
        { success: false, error: 'Invalid OpenRouter API key format' },
        { status: 400 }
      );
    }

    // Validate with OpenRouter
    const isValid = await validateOpenRouterKey(apiKey);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'OpenRouter API key is invalid or inactive' },
        { status: 400 }
      );
    }

    // Encrypt and save to user_api_keys table
    const encrypted = encryptApiKey(apiKey);
    const keyPrefix = apiKey.substring(0, 10);

    // Deactivate any existing OpenRouter keys for this user
    await prisma.user_api_keys.updateMany({
      where: {
        userId,
        provider: 'openrouter'
      },
      data: {
        isActive: false
      }
    });

    // Create new API key record
    await prisma.user_api_keys.create({
      data: {
        id: nanoid(),
        userId,
        provider: 'openrouter',
        name: 'OpenRouter API Key',
        keyPrefix,
        encryptedKey: encrypted,
        isActive: true
      }
    });

    return NextResponse.json({
      success: true,
      message: 'API key saved successfully'
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Unauthorized' },
      { status: 401 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await authenticateRequest(request);

    // Deactivate all OpenRouter keys for this user
    await prisma.user_api_keys.updateMany({
      where: {
        userId,
        provider: 'openrouter'
      },
      data: {
        isActive: false
      }
    });

    return NextResponse.json({
      success: true,
      message: 'API key removed'
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
}
