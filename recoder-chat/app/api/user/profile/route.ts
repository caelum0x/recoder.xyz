// User profile API endpoint for Recoder Chat
import { NextRequest } from 'next/server';
import { auth } from '@/app/(auth)/auth';
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

    // Return chat-specific profile data
    return Response.json({
      ...profile,
      chat_specific: {
        messages_today: profile.usage_stats.chat.messages_today,
        daily_limit: profile.usage_stats.chat.daily_limit,
        conversations: profile.usage_stats.chat.conversations,
        conversations_limit: profile.usage_stats.chat.conversations_limit,
        can_send_message: profile.usage_stats.chat.messages_today < profile.usage_stats.chat.daily_limit || profile.usage_stats.chat.daily_limit === -1,
        can_create_conversation: profile.usage_stats.chat.conversations < profile.usage_stats.chat.conversations_limit || profile.usage_stats.chat.conversations_limit === -1,
      }
    });
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