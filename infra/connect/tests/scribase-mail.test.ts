import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScribaseMailSender, magicLinkEmail } from '../src/mail/scribase-mail.js';
import type { ScribaseMailCredential } from '../src/env.js';

const CONFIGURED: ScribaseMailCredential = {
  apiUrl: 'https://api.scribase.com',
  apiKey: 'smail_test_1',
  present: true,
  from: 'Recoder <connect@mail.recoder.xyz>',
};

const UNCONFIGURED: ScribaseMailCredential = { apiUrl: 'https://api.scribase.com', apiKey: null, present: false, from: '' };

describe('createScribaseMailSender', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails closed without an API key, never attempting a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const sender = createScribaseMailSender(UNCONFIGURED);
    const result = await sender.send({ to: 'a@b.com', subject: 's', html: '<p>h</p>', text: 't' });
    expect(result).toEqual({ ok: false, reason: 'scribase_mail_not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to /emails with a bearer token and the Resend-compatible payload shape', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const sender = createScribaseMailSender(CONFIGURED);
    const result = await sender.send({ to: 'dev@example.com', subject: 'Sign in', html: '<p>hi</p>', text: 'hi', idempotencyKey: 'k1' });

    expect(result).toEqual({ ok: true, id: 'email_123' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.scribase.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer smail_test_1');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('k1');
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(['dev@example.com']);
    expect(body.from).toBe('Recoder <connect@mail.recoder.xyz>');
  });

  it('reports a truthful failure on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('server error', { status: 500 })));
    const sender = createScribaseMailSender(CONFIGURED);
    const result = await sender.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain('scribase_mail_http_500');
  });

  it('reports a truthful failure on a network error, never throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND'); }));
    const sender = createScribaseMailSender(CONFIGURED);
    const result = await sender.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain('scribase_mail_network_error');
  });
});

describe('magicLinkEmail', () => {
  it('embeds the sign-in url in both the html and text bodies', () => {
    const email = magicLinkEmail('https://connect.recoder.xyz/api/auth/magic-link/verify?token=abc');
    expect(email.html).toContain('https://connect.recoder.xyz/api/auth/magic-link/verify?token=abc');
    expect(email.text).toContain('https://connect.recoder.xyz/api/auth/magic-link/verify?token=abc');
    expect(email.subject).toBe('Sign in to Recoder Connect');
  });
});
