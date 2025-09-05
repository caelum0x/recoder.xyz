import { NextResponse } from 'next/server';
import { ManagementClient, AuthenticationClient } from 'auth0';

// 🔐 AUTH0 INTEGRATION - REAL AUTHENTICATION & USER MANAGEMENT
// Complete Auth0 API integration with user management, roles, and security

const management = new ManagementClient({
  domain: process.env.AUTH0_DOMAIN || '',
  clientId: process.env.AUTH0_M2M_CLIENT_ID || '',
  clientSecret: process.env.AUTH0_M2M_CLIENT_SECRET || ''
}) as any; // Type assertion for Auth0 API compatibility

const auth = new AuthenticationClient({
  domain: process.env.AUTH0_DOMAIN || '',
  clientId: process.env.AUTH0_CLIENT_ID || '',
  clientSecret: process.env.AUTH0_CLIENT_SECRET || ''
});

interface Auth0Action {
  action: 'get_users' | 'create_user' | 'update_user' | 'delete_user' | 'get_user' | 'assign_role' | 'remove_role' | 'get_roles' | 'create_role' | 'update_role' | 'delete_role' | 'get_organizations' | 'create_organization' | 'add_user_to_org' | 'remove_user_from_org' | 'get_user_permissions' | 'assign_permissions' | 'remove_permissions' | 'get_logs' | 'block_user' | 'unblock_user' | 'send_verification_email' | 'change_password' | 'get_guardian_enrollments' | 'delete_guardian_enrollment';
  data?: any;
  user_id?: string;
  role_id?: string;
  organization_id?: string;
  permission_id?: string;
  enrollment_id?: string;
}

export async function POST(request: Request) {
  try {
    const body: Auth0Action = await request.json();
    const { action, data, user_id, role_id, organization_id, permission_id, enrollment_id } = body;

    let result;

    switch (action) {
      case 'get_users':
        result = await getUsers(data);
        break;
        
      case 'create_user':
        result = await createUser(data);
        break;
        
      case 'update_user':
        result = await updateUser(user_id!, data);
        break;
        
      case 'delete_user':
        result = await deleteUser(user_id!);
        break;
        
      case 'get_user':
        result = await getUser(user_id!);
        break;
        
      case 'assign_role':
        result = await assignRole(user_id!, data);
        break;
        
      case 'remove_role':
        result = await removeRole(user_id!, data);
        break;
        
      case 'get_roles':
        result = await getRoles(data);
        break;
        
      case 'create_role':
        result = await createRole(data);
        break;
        
      case 'update_role':
        result = await updateRole(role_id!, data);
        break;
        
      case 'delete_role':
        result = await deleteRole(role_id!);
        break;
        
      case 'get_organizations':
        result = await getOrganizations(data);
        break;
        
      case 'create_organization':
        result = await createOrganization(data);
        break;
        
      case 'add_user_to_org':
        result = await addUserToOrganization(organization_id!, user_id!);
        break;
        
      case 'remove_user_from_org':
        result = await removeUserFromOrganization(organization_id!, user_id!);
        break;
        
      case 'get_user_permissions':
        result = await getUserPermissions(user_id!);
        break;
        
      case 'assign_permissions':
        result = await assignPermissions(user_id!, data);
        break;
        
      case 'remove_permissions':
        result = await removePermissions(user_id!, data);
        break;
        
      case 'get_logs':
        result = await getLogs(data);
        break;
        
      case 'block_user':
        result = await blockUser(user_id!);
        break;
        
      case 'unblock_user':
        result = await unblockUser(user_id!);
        break;
        
      case 'send_verification_email':
        result = await sendVerificationEmail(user_id!);
        break;
        
      case 'change_password':
        result = await changePassword(data);
        break;
        
      case 'get_guardian_enrollments':
        result = await getGuardianEnrollments(user_id!);
        break;
        
      case 'delete_guardian_enrollment':
        result = await deleteGuardianEnrollment(user_id!, enrollment_id!);
        break;
        
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Auth0 API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Auth0 integration failed',
        statusCode: error.statusCode || 500
      },
      { status: 500 }
    );
  }
}

// Get users with advanced filtering and pagination
async function getUsers(params: any = {}) {
  const users = await management.getUsers({
    search_engine: 'v3',
    q: params.query,
    per_page: params.per_page || 10,
    page: params.page || 0,
    include_totals: params.include_totals !== false,
    sort: params.sort || 'created_at:-1',
    connection: params.connection,
    fields: params.fields,
    include_fields: params.include_fields !== false
  });

  return {
    users: users.map((user: any) => ({
      user_id: user.user_id,
      email: user.email,
      email_verified: user.email_verified,
      username: user.username,
      phone_number: user.phone_number,
      phone_verified: user.phone_verified,
      created_at: user.created_at,
      updated_at: user.updated_at,
      identities: user.identities,
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
      picture: user.picture,
      name: user.name,
      nickname: user.nickname,
      multifactor: user.multifactor,
      last_ip: user.last_ip,
      last_login: user.last_login,
      logins_count: user.logins_count,
      blocked: user.blocked,
      given_name: user.given_name,
      family_name: user.family_name
    })),
    total: users.total,
    start: users.start,
    limit: users.limit,
    length: users.length
  };
}

// Create user with comprehensive profile data
async function createUser(data: any) {
  const userData = {
    connection: data.connection || 'Username-Password-Authentication',
    email: data.email,
    username: data.username,
    password: data.password,
    phone_number: data.phone_number,
    user_metadata: data.user_metadata || {},
    app_metadata: data.app_metadata || {},
    email_verified: data.email_verified || false,
    phone_verified: data.phone_verified || false,
    verify_email: data.verify_email !== false,
    blocked: data.blocked || false,
    picture: data.picture,
    name: data.name,
    nickname: data.nickname,
    given_name: data.given_name,
    family_name: data.family_name
  };

  const user = await management.createUser(userData);

  return {
    user_id: user.user_id,
    email: user.email,
    username: user.username,
    created_at: user.created_at,
    email_verified: user.email_verified,
    identities: user.identities
  };
}

// Update user with full profile management
async function updateUser(userId: string, data: any) {
  const updateData: any = {};
  
  if (data.email) updateData.email = data.email;
  if (data.username) updateData.username = data.username;
  if (data.password) updateData.password = data.password;
  if (data.phone_number) updateData.phone_number = data.phone_number;
  if (data.user_metadata) updateData.user_metadata = data.user_metadata;
  if (data.app_metadata) updateData.app_metadata = data.app_metadata;
  if (data.email_verified !== undefined) updateData.email_verified = data.email_verified;
  if (data.phone_verified !== undefined) updateData.phone_verified = data.phone_verified;
  if (data.blocked !== undefined) updateData.blocked = data.blocked;
  if (data.picture) updateData.picture = data.picture;
  if (data.name) updateData.name = data.name;
  if (data.nickname) updateData.nickname = data.nickname;
  if (data.given_name) updateData.given_name = data.given_name;
  if (data.family_name) updateData.family_name = data.family_name;
  if (data.verify_email !== undefined) updateData.verify_email = data.verify_email;

  const user = await management.updateUser({ id: userId }, updateData);

  return {
    user_id: user.user_id,
    email: user.email,
    username: user.username,
    updated_at: user.updated_at,
    user_metadata: user.user_metadata,
    app_metadata: user.app_metadata
  };
}

// Delete user
async function deleteUser(userId: string) {
  await management.deleteUser({ id: userId });
  
  return {
    user_id: userId,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

// Get user by ID
async function getUser(userId: string) {
  const user = await management.getUser({ id: userId });
  
  return {
    user_id: user.user_id,
    email: user.email,
    email_verified: user.email_verified,
    username: user.username,
    phone_number: user.phone_number,
    phone_verified: user.phone_verified,
    created_at: user.created_at,
    updated_at: user.updated_at,
    identities: user.identities,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
    picture: user.picture,
    name: user.name,
    nickname: user.nickname,
    multifactor: user.multifactor,
    last_ip: user.last_ip,
    last_login: user.last_login,
    logins_count: user.logins_count,
    blocked: user.blocked
  };
}

// Assign roles to user
async function assignRole(userId: string, data: any) {
  const roleData = {
    roles: Array.isArray(data.roles) ? data.roles : [data.role_id || data.roles]
  };
  
  await management.assignRolestoUser({ id: userId }, roleData);
  
  return {
    user_id: userId,
    roles_assigned: roleData.roles,
    assigned_at: new Date().toISOString()
  };
}

// Remove roles from user
async function removeRole(userId: string, data: any) {
  const roleData = {
    roles: Array.isArray(data.roles) ? data.roles : [data.role_id || data.roles]
  };
  
  await management.removeRolesFromUser({ id: userId }, roleData);
  
  return {
    user_id: userId,
    roles_removed: roleData.roles,
    removed_at: new Date().toISOString()
  };
}

// Get roles
async function getRoles(params: any = {}) {
  const roles = await management.getRoles({
    per_page: params.per_page || 10,
    page: params.page || 0,
    include_totals: params.include_totals !== false,
    name_filter: params.name_filter
  });

  return {
    roles: roles.map((role: any) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions
    })),
    total: roles.total,
    start: roles.start,
    limit: roles.limit
  };
}

// Create role
async function createRole(data: any) {
  const role = await management.createRole({
    name: data.name,
    description: data.description,
    permissions: data.permissions || []
  });

  return {
    role_id: role.id,
    name: role.name,
    description: role.description,
    permissions: role.permissions
  };
}

// Update role
async function updateRole(roleId: string, data: any) {
  const role = await management.updateRole({ id: roleId }, {
    name: data.name,
    description: data.description
  });

  return {
    role_id: role.id,
    name: role.name,
    description: role.description,
    updated_at: new Date().toISOString()
  };
}

// Delete role
async function deleteRole(roleId: string) {
  await management.deleteRole({ id: roleId });
  
  return {
    role_id: roleId,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

// Get organizations
async function getOrganizations(params: any = {}) {
  const orgs = await management.getOrganizations({
    per_page: params.per_page || 10,
    page: params.page || 0,
    include_totals: params.include_totals !== false,
    from: params.from,
    take: params.take
  });

  return {
    organizations: orgs.map((org: any) => ({
      id: org.id,
      name: org.name,
      display_name: org.display_name,
      branding: org.branding,
      metadata: org.metadata,
      created_at: org.created_at,
      updated_at: org.updated_at
    })),
    total: orgs.total
  };
}

// Create organization
async function createOrganization(data: any) {
  const org = await management.createOrganization({
    name: data.name,
    display_name: data.display_name,
    branding: data.branding,
    metadata: data.metadata || {}
  });

  return {
    organization_id: org.id,
    name: org.name,
    display_name: org.display_name,
    created_at: org.created_at
  };
}

// Add user to organization
async function addUserToOrganization(organizationId: string, userId: string) {
  await management.addUsersToOrganization(
    { id: organizationId },
    { users: [userId] }
  );

  return {
    organization_id: organizationId,
    user_id: userId,
    added_at: new Date().toISOString()
  };
}

// Remove user from organization
async function removeUserFromOrganization(organizationId: string, userId: string) {
  await management.removeUsersFromOrganization(
    { id: organizationId },
    { users: [userId] }
  );

  return {
    organization_id: organizationId,
    user_id: userId,
    removed_at: new Date().toISOString()
  };
}

// Get user permissions
async function getUserPermissions(userId: string) {
  const permissions = await management.getUserPermissions({ id: userId });

  return {
    user_id: userId,
    permissions: permissions.map((perm: any) => ({
      permission_name: perm.permission_name,
      resource_server_identifier: perm.resource_server_identifier,
      resource_server_name: perm.resource_server_name,
      description: perm.description
    }))
  };
}

// Assign permissions to user
async function assignPermissions(userId: string, data: any) {
  await management.assignPermissionsToUser({ id: userId }, {
    permissions: data.permissions
  });

  return {
    user_id: userId,
    permissions_assigned: data.permissions,
    assigned_at: new Date().toISOString()
  };
}

// Remove permissions from user
async function removePermissions(userId: string, data: any) {
  await management.removePermissionsFromUser({ id: userId }, {
    permissions: data.permissions
  });

  return {
    user_id: userId,
    permissions_removed: data.permissions,
    removed_at: new Date().toISOString()
  };
}

// Get logs
async function getLogs(params: any = {}) {
  const logs = await management.getLogs({
    per_page: params.per_page || 10,
    page: params.page || 0,
    include_totals: params.include_totals !== false,
    from: params.from,
    take: params.take,
    sort: params.sort || 'date:-1',
    q: params.query
  });

  return {
    logs: logs.map((log: any) => ({
      log_id: log._id,
      date: log.date,
      type: log.type,
      client_id: log.client_id,
      client_name: log.client_name,
      ip: log.ip,
      user_agent: log.user_agent,
      user_id: log.user_id,
      user_name: log.user_name,
      connection: log.connection,
      connection_id: log.connection_id,
      details: log.details,
      hostname: log.hostname,
      audience: log.audience,
      scope: log.scope
    })),
    total: logs.total
  };
}

// Block user
async function blockUser(userId: string) {
  await management.updateUser({ id: userId }, { blocked: true });
  
  return {
    user_id: userId,
    blocked: true,
    blocked_at: new Date().toISOString()
  };
}

// Unblock user
async function unblockUser(userId: string) {
  await management.updateUser({ id: userId }, { blocked: false });
  
  return {
    user_id: userId,
    blocked: false,
    unblocked_at: new Date().toISOString()
  };
}

// Send verification email
async function sendVerificationEmail(userId: string) {
  const ticket = await management.sendEmailVerification({ user_id: userId });
  
  return {
    user_id: userId,
    ticket: ticket.ticket,
    sent_at: new Date().toISOString()
  };
}

// Change password
async function changePassword(data: any) {
  const ticket = await (auth as any).requestChangePasswordEmail({
    email: data.email,
    connection: data.connection || 'Username-Password-Authentication'
  });
  
  return {
    ticket: ticket,
    email: data.email,
    sent_at: new Date().toISOString()
  };
}

// Get Guardian enrollments (MFA)
async function getGuardianEnrollments(userId: string) {
  const enrollments = await management.getGuardianEnrollments({ id: userId });
  
  return {
    user_id: userId,
    enrollments: enrollments.map((enrollment: any) => ({
      id: enrollment.id,
      status: enrollment.status,
      type: enrollment.type,
      name: enrollment.name,
      identifier: enrollment.identifier,
      phone_number: enrollment.phone_number,
      auth_method: enrollment.auth_method,
      enrolled_at: enrollment.enrolled_at,
      last_auth: enrollment.last_auth
    }))
  };
}

// Delete Guardian enrollment (remove MFA)
async function deleteGuardianEnrollment(userId: string, enrollmentId: string) {
  await management.deleteGuardianEnrollment({ 
    id: userId,
    enrollment_id: enrollmentId
  });
  
  return {
    user_id: userId,
    enrollment_id: enrollmentId,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

export async function GET() {
  return NextResponse.json({
    service: 'Auth0 Integration',
    status: 'operational',
    features: [
      'User Management',
      'Role-Based Access Control',
      'Organization Management',
      'Multi-Factor Authentication',
      'Audit Logs',
      'Permission Management',
      'Email Verification',
      'Password Management',
      'User Blocking/Unblocking',
      'Custom User Metadata'
    ],
    endpoints: {
      users: ['get', 'create', 'update', 'delete', 'block', 'unblock'],
      roles: ['get', 'create', 'update', 'delete', 'assign', 'remove'],
      organizations: ['get', 'create', 'add_users', 'remove_users'],
      permissions: ['get_user_permissions', 'assign', 'remove'],
      logs: ['get_audit_logs', 'filter_logs'],
      security: ['mfa_enrollments', 'email_verification', 'password_change']
    },
    authentication_methods: [
      'Username/Password',
      'Social Login (Google, Facebook, etc.)',
      'Enterprise (SAML, LDAP)',
      'Multi-Factor Authentication',
      'Passwordless (SMS, Email)',
      'Single Sign-On (SSO)'
    ],
    mfa_methods: [
      'SMS',
      'Voice',
      'Push Notification',
      'OTP (One-Time Password)',
      'WebAuthn',
      'Recovery Codes'
    ]
  });
}