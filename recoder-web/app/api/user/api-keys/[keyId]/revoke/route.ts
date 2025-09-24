// API Key revocation endpoint
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(request: NextRequest, { params }: { params: { keyId: string } }) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const keyId = params.keyId;

    // In a real implementation, you would:
    // 1. Verify the API key belongs to the user
    // 2. Mark the key as revoked in database
    // 3. Add to revocation blacklist for immediate invalidation
    // 4. Log the revocation for audit purposes

    console.log(`Revoking API key ${keyId} for user ${session.user.id}`);

    return Response.json({ 
      success: true,
      message: 'API key revoked successfully' 
    });
  } catch (error) {
    console.error('API key revocation error:', error);
    return Response.json({ error: 'Failed to revoke API key' }, { status: 500 });
  }
}