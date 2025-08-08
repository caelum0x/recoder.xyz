/**
 * Server-only authentication utilities
 * This module dynamically imports NextAuth to avoid client-side bundling issues
 */

// Dynamic import wrapper for getServerSession
export async function getServerSessionSafe() {
  const [{ getServerSession }, { authOptions }] = await Promise.all([
    import("next-auth"),
    import("./auth")
  ]);
  return getServerSession(authOptions);
}

// Server-side session validation
export async function validateServerSession() {
  const session = await getServerSessionSafe();
  
  if (!session?.user?.id) {
    throw new Error("Unauthorized: No valid session found");
  }
  
  return session;
}

// Get user ID from session
export async function getUserId(): Promise<string> {
  const session = await validateServerSession();
  return session.user.id;
}

// Check if user has required plan
export async function requirePlan(requiredPlan: 'FREE' | 'PRO' | 'ENTERPRISE') {
  const session = await validateServerSession();
  const planHierarchy = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
  
  const userLevel = planHierarchy[session.user.plan];
  const requiredLevel = planHierarchy[requiredPlan];
  
  if (userLevel < requiredLevel) {
    throw new Error(`Insufficient plan access. Required: ${requiredPlan}, Current: ${session.user.plan}`);
  }
  
  return session;
}