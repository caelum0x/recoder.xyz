/**
 * Scribase Mail client — the one transactional-mail path Recoder Connect
 * uses for magic-link sign-in. Scribase Mail (api.scribase.com) exposes a
 * Resend-compatible API (`POST /emails`, `Authorization: Bearer <key>`); see
 * ~/products/plans/scribase-mail.md and
 * scribase-mail-studio/apps/web/src/server/public-api/resend/emails.ts for
 * the contract this mirrors. No new dependency is added — this is a plain
 * `fetch` call, Workers-native.
 *
 * Fail-safe: a missing API key never throws at import time; `send()` returns
 * a typed failure the caller must surface (never a silently-dropped email).
 */
import type { ScribaseMailCredential } from '../env.js';

export interface SendEmailInput {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  /** Resend/Scribase dedupe key — a magic-link resend within the same
   * request window must not fan out into two emails. */
  readonly idempotencyKey?: string;
}

export type SendEmailResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string };

export interface MailSender {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export function createScribaseMailSender(credential: ScribaseMailCredential): MailSender {
  return {
    async send(input: SendEmailInput): Promise<SendEmailResult> {
      if (!credential.present || !credential.apiKey) {
        return { ok: false, reason: 'scribase_mail_not_configured' };
      }
      try {
        const response = await fetch(`${credential.apiUrl}/emails`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${credential.apiKey}`,
            ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
          },
          body: JSON.stringify({
            from: credential.from,
            to: [input.to],
            subject: input.subject,
            html: input.html,
            text: input.text,
          }),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          return { ok: false, reason: `scribase_mail_http_${response.status}:${body.slice(0, 200)}` };
        }
        const json = (await response.json().catch(() => null)) as { id?: string } | null;
        return { ok: true, id: json?.id ?? 'unknown' };
      } catch (error) {
        return {
          ok: false,
          reason: `scribase_mail_network_error:${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

export function magicLinkEmail(url: string): { subject: string; html: string; text: string } {
  const subject = 'Sign in to Recoder Connect';
  const text = `Sign in to Recoder Connect:\n\n${url}\n\nThis link expires in 10 minutes. If you did not request this, ignore this email.`;
  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="font-weight: 600;">Sign in to Recoder Connect</h2>
      <p>Click the button below to sign in. This link expires in 10 minutes.</p>
      <p style="margin: 24px 0;">
        <a href="${url}" style="background:#000; color:#fff; padding:12px 20px; border-radius:8px; text-decoration:none; display:inline-block;">Sign in</a>
      </p>
      <p style="color:#666; font-size:13px;">If you did not request this, you can safely ignore this email.</p>
    </div>
  `.trim();
  return { subject, html, text };
}
