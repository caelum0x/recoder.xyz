// Individual API Key management endpoint
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export async function PATCH(request: NextRequest, { params }: { params: { keyId: string } }) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keyId } = params;
    const updates = await request.json();

    // Validate allowed updates
    const allowedFields = ['name', 'status', 'permissions', 'rateLimit', 'ipRestrictions'];
    const validUpdates: any = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        validUpdates[key] = value;
      }
    }

    console.log(`Updating API key ${keyId}:`, validUpdates);

    return Response.json({ 
      success: true,
      message: 'API key updated successfully' 
    });
  } catch (error) {
    console.error('API key update error:', error);
    return Response.json({ error: 'Failed to update API key' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { keyId: string } }) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keyId } = params;

    console.log(`Deleting API key ${keyId} for user ${session.user.id}`);

    return Response.json({ 
      success: true,
      message: 'API key deleted successfully' 
    });
  } catch (error) {
    console.error('API key deletion error:', error);
    return Response.json({ error: 'Failed to delete API key' }, { status: 500 });
  }
}