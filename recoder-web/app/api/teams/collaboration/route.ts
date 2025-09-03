import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/jwt';
import { db } from '@/lib/database/client';
import { Server } from 'socket.io';
import { createServer } from 'http';

// Team Collaboration System
export const POST = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'invite_member':
        return await inviteTeamMember(user, body);
      case 'accept_invitation':
        return await acceptInvitation(user, body);
      case 'update_permissions':
        return await updateMemberPermissions(user, body);
      case 'create_workspace':
        return await createWorkspace(user, body);
      case 'assign_task':
        return await assignTask(user, body);
      case 'create_approval_request':
        return await createApprovalRequest(user, body);
      case 'approve_content':
        return await approveContent(user, body);
      case 'start_collaboration_session':
        return await startCollaborationSession(user, body);
      case 'comment':
        return await addComment(user, body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Collaboration error:', error);
    return NextResponse.json({ error: 'Collaboration operation failed' }, { status: 500 });
  }
});

export const GET = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    const type = searchParams.get('type') || 'overview';

    switch (type) {
      case 'members':
        return await getTeamMembers(user, teamId);
      case 'tasks':
        return await getTeamTasks(user, teamId);
      case 'approvals':
        return await getPendingApprovals(user, teamId);
      case 'activity':
        return await getTeamActivity(user, teamId);
      case 'workspace':
        return await getWorkspaceData(user, teamId);
      default:
        return await getCollaborationOverview(user, teamId);
    }
  } catch (error) {
    console.error('Collaboration fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch collaboration data' }, { status: 500 });
  }
});

// Invite Team Member
async function inviteTeamMember(user: any, body: any) {
  const { team_id, email, role = 'member', permissions = {} } = body;

  // Verify user can invite members
  const teamQuery = `
    SELECT tm.role FROM team_members tm 
    WHERE tm.team_id = $1 AND tm.user_id = $2 AND tm.status = 'active'
  `;
  const teamResult = await db.query(teamQuery, [team_id, user.userId]);
  
  if (teamResult.rows.length === 0 || !['owner', 'admin'].includes(teamResult.rows[0].role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // Check if user already exists
  const userQuery = `SELECT id FROM users WHERE email = $1`;
  const userResult = await db.query(userQuery, [email]);
  let invitedUserId = null;

  if (userResult.rows.length > 0) {
    invitedUserId = userResult.rows[0].id;
    
    // Check if already a team member
    const memberQuery = `SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2`;
    const memberResult = await db.query(memberQuery, [team_id, invitedUserId]);
    
    if (memberResult.rows.length > 0) {
      return NextResponse.json({ error: 'User is already a team member' }, { status: 409 });
    }
  }

  // Create invitation
  const invitationQuery = `
    INSERT INTO team_members (team_id, user_id, role, permissions, invited_by, invited_at, status)
    VALUES ($1, $2, $3, $4, $5, NOW(), $6)
    RETURNING *
  `;

  const status = invitedUserId ? 'pending' : 'invited'; // invited = email not registered
  const invitationResult = await db.query(invitationQuery, [
    team_id, invitedUserId, role, JSON.stringify(permissions), user.userId, status
  ]);

  // Send invitation email (in production)
  await sendInvitationEmail(email, team_id, invitationResult.rows[0].id);

  // Create notification
  await createNotification({
    user_id: invitedUserId,
    team_id: team_id,
    type: 'team_invitation',
    title: 'Team Invitation',
    message: `You've been invited to join a team`,
    data: { invitation_id: invitationResult.rows[0].id }
  });

  return NextResponse.json({
    success: true,
    invitation: invitationResult.rows[0]
  });
}

// Accept Invitation
async function acceptInvitation(user: any, body: any) {
  const { invitation_id } = body;

  const invitationQuery = `
    SELECT * FROM team_members 
    WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'invited')
  `;
  const invitationResult = await db.query(invitationQuery, [invitation_id, user.userId]);

  if (invitationResult.rows.length === 0) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }

  const invitation = invitationResult.rows[0];

  // Update invitation status
  const updateQuery = `
    UPDATE team_members 
    SET status = 'active', joined_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const updateResult = await db.query(updateQuery, [invitation_id]);

  // Create welcome notification
  await createNotification({
    team_id: invitation.team_id,
    type: 'member_joined',
    title: 'New Team Member',
    message: `${user.email} joined the team`,
    data: { user_id: user.userId }
  });

  return NextResponse.json({
    success: true,
    membership: updateResult.rows[0]
  });
}

// Update Member Permissions
async function updateMemberPermissions(user: any, body: any) {
  const { team_id, member_id, role, permissions } = body;

  // Verify permissions
  const permissionQuery = `
    SELECT role FROM team_members 
    WHERE team_id = $1 AND user_id = $2 AND status = 'active'
  `;
  const permissionResult = await db.query(permissionQuery, [team_id, user.userId]);
  
  if (permissionResult.rows.length === 0 || !['owner', 'admin'].includes(permissionResult.rows[0].role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // Update member
  const updateQuery = `
    UPDATE team_members 
    SET role = $1, permissions = $2, updated_at = NOW()
    WHERE id = $3 AND team_id = $4
    RETURNING *
  `;
  const updateResult = await db.query(updateQuery, [
    role, JSON.stringify(permissions), member_id, team_id
  ]);

  return NextResponse.json({
    success: true,
    member: updateResult.rows[0]
  });
}

// Create Workspace
async function createWorkspace(user: any, body: any) {
  const { team_id, name, description, type = 'project', settings = {} } = body;

  // Create workspace (using content_library table with workspace type)
  const workspaceQuery = `
    INSERT INTO content_library (
      user_id, team_id, title, content, content_type, 
      category, platform_specific, created_by
    ) VALUES ($1, $2, $3, $4, 'workspace', 'collaboration', $5, $6)
    RETURNING *
  `;

  const workspaceResult = await db.query(workspaceQuery, [
    user.userId, team_id, name, description || '', JSON.stringify({
      type, settings, created_at: new Date().toISOString()
    }), user.userId
  ]);

  // Notify team members
  await notifyTeamMembers(team_id, {
    type: 'workspace_created',
    title: 'New Workspace Created',
    message: `${name} workspace has been created`,
    data: { workspace_id: workspaceResult.rows[0].id }
  });

  return NextResponse.json({
    success: true,
    workspace: workspaceResult.rows[0]
  });
}

// Assign Task
async function assignTask(user: any, body: any) {
  const { team_id, assignee_id, task_title, task_description, due_date, priority = 'medium', content_id } = body;

  // Create task (using notifications table with task type)
  const taskQuery = `
    INSERT INTO notifications (
      user_id, team_id, type, title, message, data, expires_at, priority
    ) VALUES ($1, $2, 'task', $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const taskData = {
    assigned_by: user.userId,
    content_id,
    status: 'pending',
    created_at: new Date().toISOString()
  };

  const taskResult = await db.query(taskQuery, [
    assignee_id, team_id, task_title, task_description,
    JSON.stringify(taskData), due_date ? new Date(due_date) : null, priority
  ]);

  // Create activity log
  await logActivity({
    team_id,
    user_id: user.userId,
    action: 'task_assigned',
    details: {
      task_id: taskResult.rows[0].id,
      assignee_id,
      task_title
    }
  });

  return NextResponse.json({
    success: true,
    task: taskResult.rows[0]
  });
}

// Create Approval Request
async function createApprovalRequest(user: any, body: any) {
  const { team_id, content_id, message, approvers = [], due_date } = body;

  if (approvers.length === 0) {
    // Get team admins as default approvers
    const adminQuery = `
      SELECT user_id FROM team_members 
      WHERE team_id = $1 AND role IN ('owner', 'admin') AND status = 'active'
    `;
    const adminResult = await db.query(adminQuery, [team_id]);
    approvers.push(...adminResult.rows.map(row => row.user_id));
  }

  // Update content status
  await db.query(`
    UPDATE content_library 
    SET approval_required = true, status = 'pending_approval'
    WHERE id = $1
  `, [content_id]);

  // Create approval requests for each approver
  const approvalPromises = approvers.map(approverId =>
    db.query(`
      INSERT INTO notifications (
        user_id, team_id, type, title, message, data, expires_at, priority
      ) VALUES ($1, $2, 'approval_request', $3, $4, $5, $6, 'high')
    `, [
      approverId, team_id, 'Content Approval Required',
      message || 'Please review and approve this content',
      JSON.stringify({
        content_id,
        requested_by: user.userId,
        status: 'pending'
      }),
      due_date ? new Date(due_date) : null
    ])
  );

  await Promise.all(approvalPromises);

  return NextResponse.json({
    success: true,
    message: 'Approval requests sent',
    approvers_count: approvers.length
  });
}

// Approve Content
async function approveContent(user: any, body: any) {
  const { content_id, team_id, approved, feedback = '' } = body;

  const status = approved ? 'approved' : 'rejected';

  // Update content status
  const updateQuery = `
    UPDATE content_library 
    SET status = $1, approved_by = $2, approved_at = NOW()
    WHERE id = $3 AND (user_id = $4 OR team_id = $5)
    RETURNING *
  `;

  const updateResult = await db.query(updateQuery, [
    status, user.userId, content_id, user.userId, team_id
  ]);

  if (updateResult.rows.length === 0) {
    return NextResponse.json({ error: 'Content not found' }, { status: 404 });
  }

  // Update approval notifications
  await db.query(`
    UPDATE notifications 
    SET read_at = NOW(), data = data || $1
    WHERE type = 'approval_request' AND data->>'content_id' = $2
  `, [JSON.stringify({ approved, approved_by: user.userId, feedback }), content_id]);

  // Notify content creator
  const content = updateResult.rows[0];
  await createNotification({
    user_id: content.created_by,
    team_id: team_id,
    type: approved ? 'content_approved' : 'content_rejected',
    title: approved ? 'Content Approved' : 'Content Rejected',
    message: approved 
      ? 'Your content has been approved and is ready to publish'
      : `Your content was rejected: ${feedback}`,
    data: { content_id, approved_by: user.userId }
  });

  return NextResponse.json({
    success: true,
    content: updateResult.rows[0],
    status
  });
}

// Start Collaboration Session
async function startCollaborationSession(user: any, body: any) {
  const { content_id, team_id, participants = [] } = body;

  // Create collaboration session
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const sessionData = {
    session_id: sessionId,
    content_id,
    host_id: user.userId,
    participants: [...participants, user.userId],
    started_at: new Date().toISOString(),
    status: 'active'
  };

  // Store session (using notifications table with session type)
  const sessionQuery = `
    INSERT INTO notifications (
      team_id, type, title, message, data, priority
    ) VALUES ($1, 'collaboration_session', $2, $3, $4, 'normal')
    RETURNING *
  `;

  const sessionResult = await db.query(sessionQuery, [
    team_id,
    'Collaboration Session Started',
    `Real-time collaboration session for content editing`,
    JSON.stringify(sessionData)
  ]);

  // Notify participants
  for (const participantId of participants) {
    if (participantId !== user.userId) {
      await createNotification({
        user_id: participantId,
        team_id: team_id,
        type: 'collaboration_invite',
        title: 'Collaboration Session',
        message: 'You\'ve been invited to a live collaboration session',
        data: { session_id: sessionId, content_id }
      });
    }
  }

  return NextResponse.json({
    success: true,
    session_id: sessionId,
    session_data: sessionData
  });
}

// Add Comment
async function addComment(user: any, body: any) {
  const { content_id, team_id, comment_text, parent_id = null, mentions = [] } = body;

  // Add comment (using notifications table with comment type)
  const commentQuery = `
    INSERT INTO notifications (
      user_id, team_id, type, title, message, data
    ) VALUES ($1, $2, 'comment', $3, $4, $5)
    RETURNING *
  `;

  const commentData = {
    content_id,
    parent_id,
    mentions,
    commented_by: user.userId,
    timestamp: new Date().toISOString()
  };

  const commentResult = await db.query(commentQuery, [
    null, // Comments are team-wide
    team_id,
    'New Comment',
    comment_text,
    JSON.stringify(commentData)
  ]);

  // Notify mentioned users
  for (const mentionedUserId of mentions) {
    await createNotification({
      user_id: mentionedUserId,
      team_id: team_id,
      type: 'mention',
      title: 'You were mentioned',
      message: `${user.email} mentioned you in a comment`,
      data: { comment_id: commentResult.rows[0].id, content_id }
    });
  }

  // Log activity
  await logActivity({
    team_id,
    user_id: user.userId,
    action: 'comment_added',
    details: { content_id, comment_id: commentResult.rows[0].id }
  });

  return NextResponse.json({
    success: true,
    comment: commentResult.rows[0]
  });
}

// Get Team Members
async function getTeamMembers(user: any, teamId: string) {
  const query = `
    SELECT tm.*, u.first_name, u.last_name, u.email, u.avatar_url,
           invited_u.first_name as invited_by_name, invited_u.last_name as invited_by_last_name
    FROM team_members tm
    JOIN users u ON tm.user_id = u.id
    LEFT JOIN users invited_u ON tm.invited_by = invited_u.id
    WHERE tm.team_id = $1
    ORDER BY tm.role, tm.joined_at DESC
  `;

  const result = await db.query(query, [teamId]);

  return NextResponse.json({
    success: true,
    members: result.rows
  });
}

// Get Team Tasks
async function getTeamTasks(user: any, teamId: string) {
  const query = `
    SELECT n.*, u.first_name, u.last_name
    FROM notifications n
    LEFT JOIN users u ON n.user_id = u.id
    WHERE n.team_id = $1 AND n.type = 'task'
    ORDER BY n.created_at DESC
    LIMIT 50
  `;

  const result = await db.query(query, [teamId]);

  return NextResponse.json({
    success: true,
    tasks: result.rows
  });
}

// Get Pending Approvals
async function getPendingApprovals(user: any, teamId: string) {
  const query = `
    SELECT n.*, cl.title as content_title, cl.content_type,
           u.first_name, u.last_name
    FROM notifications n
    JOIN content_library cl ON (n.data->>'content_id')::uuid = cl.id
    LEFT JOIN users u ON cl.created_by = u.id
    WHERE n.team_id = $1 AND n.type = 'approval_request' 
      AND n.read_at IS NULL
    ORDER BY n.created_at DESC
  `;

  const result = await db.query(query, [teamId]);

  return NextResponse.json({
    success: true,
    approvals: result.rows
  });
}

// Get Team Activity
async function getTeamActivity(user: any, teamId: string) {
  const query = `
    SELECT n.*, u.first_name, u.last_name
    FROM notifications n
    LEFT JOIN users u ON n.user_id = u.id
    WHERE n.team_id = $1 
      AND n.type IN ('member_joined', 'content_approved', 'task_assigned', 'comment')
    ORDER BY n.created_at DESC
    LIMIT 100
  `;

  const result = await db.query(query, [teamId]);

  return NextResponse.json({
    success: true,
    activities: result.rows
  });
}

// Get Workspace Data
async function getWorkspaceData(user: any, teamId: string) {
  const query = `
    SELECT * FROM content_library
    WHERE team_id = $1 AND content_type = 'workspace'
    ORDER BY created_at DESC
  `;

  const result = await db.query(query, [teamId]);

  return NextResponse.json({
    success: true,
    workspaces: result.rows
  });
}

// Get Collaboration Overview
async function getCollaborationOverview(user: any, teamId: string) {
  const [membersResult, tasksResult, approvalsResult, activityResult] = await Promise.all([
    db.query('SELECT COUNT(*) FROM team_members WHERE team_id = $1 AND status = \'active\'', [teamId]),
    db.query('SELECT COUNT(*) FROM notifications WHERE team_id = $1 AND type = \'task\' AND read_at IS NULL', [teamId]),
    db.query('SELECT COUNT(*) FROM notifications WHERE team_id = $1 AND type = \'approval_request\' AND read_at IS NULL', [teamId]),
    db.query('SELECT COUNT(*) FROM notifications WHERE team_id = $1 AND created_at > NOW() - INTERVAL \'24 hours\'', [teamId])
  ]);

  return NextResponse.json({
    success: true,
    overview: {
      members_count: parseInt(membersResult.rows[0].count),
      pending_tasks: parseInt(tasksResult.rows[0].count),
      pending_approvals: parseInt(approvalsResult.rows[0].count),
      activity_24h: parseInt(activityResult.rows[0].count)
    }
  });
}

// Helper Functions
async function sendInvitationEmail(email: string, teamId: string, invitationId: string) {
  // Email sending logic would go here
  console.log(`Sending invitation email to ${email} for team ${teamId}`);
}

async function createNotification(notification: any) {
  const { user_id, team_id, type, title, message, data = {}, priority = 'normal' } = notification;
  
  const query = `
    INSERT INTO notifications (user_id, team_id, type, title, message, data, priority)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  return await db.query(query, [user_id, team_id, type, title, message, JSON.stringify(data), priority]);
}

async function notifyTeamMembers(teamId: string, notification: any) {
  const membersQuery = `SELECT user_id FROM team_members WHERE team_id = $1 AND status = 'active'`;
  const membersResult = await db.query(membersQuery, [teamId]);

  for (const member of membersResult.rows) {
    await createNotification({
      ...notification,
      user_id: member.user_id,
      team_id: teamId
    });
  }
}

async function logActivity(activity: any) {
  const { team_id, user_id, action, details = {} } = activity;
  
  await createNotification({
    team_id: team_id,
    type: 'activity',
    title: action,
    message: JSON.stringify(details),
    data: { user_id, action, timestamp: new Date().toISOString() }
  });
}