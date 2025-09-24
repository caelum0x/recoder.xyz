import { createAuth } from '@/lib/auth/unified-auth';

const { handlers } = createAuth();

export const { GET, POST } = handlers;

// Force Node.js runtime for crypto compatibility
export const runtime = 'nodejs';