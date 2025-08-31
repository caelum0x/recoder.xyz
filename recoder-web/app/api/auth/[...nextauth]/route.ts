import { createAuth } from '@/lib/auth/unified-auth';

const { handlers } = createAuth();

export const { GET, POST } = handlers;