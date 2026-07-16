import { NextRequest, NextResponse } from 'next/server';
import { validateUserApiKey } from '@/lib/api-key-resolver';

export async function POST(request: NextRequest) {
  try {
    const { apiKey, provider = 'openrouter' } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ 
        valid: false, 
        error: 'API key is required' 
      }, { status: 400 });
    }

    const result = await validateUserApiKey(apiKey, provider);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ 
      valid: false, 
      error: 'Validation failed' 
    }, { status: 500 });
  }
}
