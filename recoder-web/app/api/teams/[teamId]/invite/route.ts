// Team invitation API endpoints
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';
import { v4 as uuidv4 } from 'uuid';

// Rate limiting for invitations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']),
  message: z.string().max(500).optional(),
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
  acceptToken: string;
}

// POST /api/teams/[teamId]/invite - Send team invitation
export async function POST(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    // Rate limiting - stricter for invitations to prevent spam
    try {
      await limiter.check(request, 10, 'team-invitations');
    } catch {
      return Response.json(
        { error: 'Too many invitation requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const teamId = params.teamId;
    const body = await request.json();

    // Validate input
    let validatedData;
    try {
      validatedData = inviteSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json(
          { 
            error: 'Validation failed', 
            details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
          },
          { status: 400 }
        );
      }
      throw error;
    }

    // Verify user has admin/owner permissions for this team
    const hasPermission = await verifyInvitePermission(session.user.id, teamId);
    if (!hasPermission) {
      return Response.json({ error: 'Insufficient permissions to invite members' }, { status: 403 });
    }

    // Check if user is already a member or has pending invitation
    const existingMember = await checkExistingMembership(teamId, validatedData.email);
    if (existingMember) {
      return Response.json(
        { error: 'User is already a member or has a pending invitation' },
        { status: 409 }
      );
    }

    // Get team info for invitation context
    const team = await getTeamInfo(teamId);
    if (!team) {
      return Response.json({ error: 'Team not found' }, { status: 404 });
    }

    // Check team member limits
    const memberLimits = {
      free: 5,
      pro: 25,
      enterprise: 500
    };

    if (team.memberCount >= memberLimits[team.plan]) {
      return Response.json(
        { 
          error: `Team member limit reached. ${team.plan} plan allows ${memberLimits[team.plan]} members.`,
          upgradeRequired: team.plan === 'free'
        },
        { status: 403 }
      );
    }

    // Create invitation
    const invitationId = uuidv4();
    const acceptToken = generateAcceptToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await createInvitation({
      id: invitationId,
      teamId,
      email: validatedData.email,
      role: validatedData.role,
      invitedBy: session.user.id,
      message: validatedData.message,
      acceptToken,
      expiresAt: expiresAt.toISOString(),
    });

    // Send invitation email
    await sendInvitationEmail({
      invitation,
      team,
      inviterName: session.user.name || session.user.email || 'Team Admin',
      acceptUrl: `${getBaseUrl(request)}/invite/${acceptToken}`,
    });

    // Log invitation event
    await logInvitationEvent(session.user.id, 'invitation_sent', {
      teamId,
      teamName: team.name,
      inviteeEmail: validatedData.email,
      role: validatedData.role,
      invitationId,
      timestamp: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent'),
    });

    return Response.json(invitation, { status: 201 });

  } catch (error) {
    console.error('Team invitation error:', error);
    return Response.json(
      { error: 'Failed to send invitation' },
      { status: 500 }
    );
  }
}

// Helper functions
async function verifyInvitePermission(userId: string, teamId: string): Promise<boolean> {
  try {
    // In production, this would check if user has admin/owner role in team
    // For demo, return true
    return true;
  } catch (error) {
    console.error('Error verifying invite permission:', error);
    return false;
  }
}

async function checkExistingMembership(teamId: string, email: string): Promise<boolean> {
  try {
    // In production, check both team members and pending invitations
    // For demo, return false
    return false;
  } catch (error) {
    console.error('Error checking existing membership:', error);
    return false;
  }
}

async function getTeamInfo(teamId: string): Promise<{ name: string; plan: string; memberCount: number } | null> {
  try {
    // In production, fetch from teams table
    return {
      name: 'Development Team',
      plan: 'pro',
      memberCount: 4,
    };
  } catch (error) {
    console.error('Error getting team info:', error);
    return null;
  }
}

function generateAcceptToken(): string {
  return uuidv4().replace(/-/g, '');
}

async function createInvitation(invitationData: {
  id: string;
  teamId: string;
  email: string;
  role: string;
  invitedBy: string;
  message?: string;
  acceptToken: string;
  expiresAt: string;
}): Promise<TeamInvitation> {
  try {
    // In production, this would create record in team_invitations table
    const invitation: TeamInvitation = {
      id: invitationData.id,
      teamId: invitationData.teamId,
      email: invitationData.email,
      role: invitationData.role as any,
      invitedBy: invitationData.invitedBy,
      invitedByName: 'Team Admin', // Would fetch from user profile
      invitedAt: new Date().toISOString(),
      expiresAt: invitationData.expiresAt,
      status: 'pending',
      message: invitationData.message,
      acceptToken: invitationData.acceptToken,
    };

    console.log('Invitation created:', invitation);
    return invitation;
  } catch (error) {
    console.error('Error creating invitation:', error);
    throw new Error('Failed to create invitation');
  }
}

async function sendInvitationEmail(emailData: {
  invitation: TeamInvitation;
  team: { name: string };
  inviterName: string;
  acceptUrl: string;
}): Promise<void> {
  try {
    // In production, this would use an email service like SendGrid
    console.log('Invitation email would be sent:', {
      to: emailData.invitation.email,
      subject: `You're invited to join ${emailData.team.name}`,
      acceptUrl: emailData.acceptUrl,
      inviterName: emailData.inviterName,
      role: emailData.invitation.role,
      expiresAt: emailData.invitation.expiresAt,
    });

    // For demo purposes, we'll just log the email content
    const emailContent = `
      Hi there!
      
      ${emailData.inviterName} has invited you to join the "${emailData.team.name}" team on Recoder.xyz as a ${emailData.invitation.role}.
      
      ${emailData.invitation.message ? `Message: ${emailData.invitation.message}` : ''}
      
      Click here to accept the invitation: ${emailData.acceptUrl}
      
      This invitation expires on ${new Date(emailData.invitation.expiresAt).toLocaleDateString()}.
      
      Best regards,
      The Recoder.xyz Team
    `;
    
    console.log('Email content:', emailContent);
  } catch (error) {
    console.error('Error sending invitation email:', error);
    // Don't throw error - invitation was created successfully
  }
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}`;
}

async function logInvitationEvent(userId: string, event: string, metadata: any): Promise<void> {
  try {
    // In production, this would write to audit log table
    console.log(`Invitation Event - User ${userId}: ${event}`, metadata);
  } catch (error) {
    console.error('Failed to log invitation event:', error);
  }
}

export const runtime = "edge";