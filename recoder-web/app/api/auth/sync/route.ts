// Session sync API endpoint for Recoder Web
import { NextRequest } from 'next/server';
import { handleSessionSync } from '@/lib/session-sync';

export async function GET(request: NextRequest) {
  return handleSessionSync(request);
}

export async function POST(request: NextRequest) {
  return handleSessionSync(request);
}

export async function DELETE(request: NextRequest) {
  return handleSessionSync(request);
}