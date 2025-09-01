import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    database_url_exists: !!process.env.DATABASE_URL,
    database_url_preview: process.env.DATABASE_URL ? 
      process.env.DATABASE_URL.substring(0, 30) + '...' : 
      'Not found',
    all_env_vars: Object.keys(process.env).filter(key => 
      key.includes('DATABASE') || key.includes('POSTGRES') || key.includes('NEON')
    )
  });
}