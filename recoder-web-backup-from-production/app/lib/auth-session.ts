export interface AuthSession {
  userId: string;
  email: string;
  name: string;
  authenticated: boolean;
  timestamp: number;
}

export function getAuthSession(request: Request): AuthSession | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader.split('; ').map(c => {
      const [key, ...v] = c.split('=');
      return [key, v.join('=')];
    })
  );

  const userCookie = cookies['recoder_user'];
  if (!userCookie) return null;

  try {
    const session = JSON.parse(decodeURIComponent(userCookie));
    
    if (Date.now() - session.timestamp > 86400000) {
      return null;
    }
    
    return session;
  } catch {
    return null;
  }
}
