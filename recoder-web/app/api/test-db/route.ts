import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrisma();
    
    // Test basic database connection
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    
    // Test if user table exists and get count
    const userCount = await prisma.user.count();
    
    return NextResponse.json({
      success: true,
      message: 'Database connection working',
      test: result,
      userCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}