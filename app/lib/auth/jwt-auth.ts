import { verify, type JwtPayload } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

type UserJwtPayload = JwtPayload & { userId?: string };

export function getUserIdFromBearerAuthHeader(authHeader: string | null): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing authorization header');
  }

  const token = authHeader.substring(7);
  const decoded = verify(token, JWT_SECRET) as UserJwtPayload | string;
  if (typeof decoded === 'string' || !decoded.userId) {
    throw new Error('Invalid token payload');
  }
  return decoded.userId;
}
