// Team invitations list API endpoint
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import rateLimit from '@/lib/rate-limit';

// Rate limiting
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

export interface TeamInvitation {
  id: string;
  teamId: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  invitedBy: string;
  invitedByName: string;
  invitedAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  message?: string;
}

// GET /api/teams/[teamId]/invitations - Get team invitations
export async function GET(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 60, 'team-invitations-list');
    } catch {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = params.teamId;

    // Verify user has access to this team
    const hasAccess = await verifyTeamAccess(session.user.id, teamId);
    if (!hasAccess) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get pending invitations for the team
    const invitations = await getTeamInvitations(teamId);

    return Response.json(invitations);

  } catch (error) {
    console.error('Team invitations list error:', error);
    return Response.json(
      { error: 'Failed to fetch team invitations' },
      { status: 500 }
    );
  }
}

// Helper functions
async function verifyTeamAccess(userId: string, teamId: string): Promise<boolean> {
  try {
    // In production, this would check team membership in database
    // For now, return true for demo purposes
    return true;
  } catch (error) {
    console.error('Error verifying team access:', error);
    return false;
  }
}

async function getTeamInvitations(teamId: string): Promise<TeamInvitation[]> {
  try {
    // In production, this would query team invitations from database
    // Return mock data for demo
    const mockInvitations: TeamInvitation[] = [
      {
        id: 'invite-1',
        teamId,
        email: 'newuser@example.com',
        role: 'member',
        invitedBy: 'user-1',
        invitedByName: 'John Doe',
        invitedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
        message: 'Welcome to our development team!',
      },
      {
        id: 'invite-2',
        teamId,
        email: 'designer@example.com',
        role: 'viewer',
        invitedBy: 'user-2',
        invitedByName: 'Jane Smith',
        invitedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
      },
      {
        id: 'invite-3',
        teamId,
        email: 'consultant@example.com',
        role: 'admin',
        invitedBy: 'user-1',
        invitedByName: 'John Doe',
        invitedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 6.5 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
        message: 'Looking forward to your expertise on our project.',
      },
    ];

    // Filter out expired invitations for display
    const now = new Date();
    const activeInvitations = mockInvitations.filter(invite => {
      const expiryDate = new Date(invite.expiresAt);
      if (expiryDate <= now && invite.status === 'pending') {
        // In production, would update status to 'expired' in database
        invite.status = 'expired';
      }
      return invite.status === 'pending'; // Only show pending invitations
    });

    return activeInvitations;
  } catch (error) {
    console.error('Error fetching team invitations:', error);
    return [];
  }
}

export const runtime = "edge";