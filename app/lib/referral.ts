import crypto from 'crypto';

export function generateReferralCode(email: string): string {
  const prefix = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'USER';
  const digest = crypto.createHash('sha256').update(`${email}:${Date.now()}:${crypto.randomUUID()}`).digest('hex');
  return `${prefix}${digest.slice(0, 6).toUpperCase()}`;
}
