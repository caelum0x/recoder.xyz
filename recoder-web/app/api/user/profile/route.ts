// User profile API endpoint for Recoder Web
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '../../../../lib/user-management';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await userManager.getUserProfile(session.user.id);
    
    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    return Response.json(profile);
  } catch (error) {
    console.error('Profile API error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updates = await request.json();
    
    const allowedFields = ['name', 'username', 'bio', 'location', 'company', 'avatar_url'];
    const validUpdates = Object.keys(updates)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {} as any);

    const success = await userManager.updateUserProfile(session.user.id, validUpdates);
    
    if (!success) {
      return Response.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    const profile = await userManager.getUserProfile(session.user.id);
    return Response.json(profile);
  } catch (error) {
    console.error('Profile update error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}