# Recoder Mail Rollout Notes

This repo already supports SMTP-first delivery in `app`.

Current live findings from the reachable production host:

- host: `77.42.23.19`
- hostname: `ubuntu-16gb-hel1-1`
- a local `postfix` service is present
- `postfix` listens on `127.0.0.1:25`
- `inet_interfaces = loopback-only`
- `myhostname = mail.recoder.xyz`
- `relayhost =` empty

Current public DNS findings:

- `recoder.xyz` SPF still authorizes `include:_spf.resend.com`
- `resend._domainkey.recoder.xyz` exists
- `_dmarc.recoder.xyz` is only `p=none`
- `mail.recoder.xyz` currently resolves to Cloudflare edge IPs
- PTR for `77.42.23.19` is `static.19.23.42.77.clients.your-server.de.`

## Meaning

The app is no longer the blocker.

The remaining blockers are operational:

1. choose the live sender path
   - keep Resend temporarily, or
   - switch fully to host SMTP / Postal / docker-mailserver
2. align DNS with the chosen sender
3. verify inbox delivery with real test mailboxes

## Recommended smallest safe path

Use the existing local Postfix as the first SMTP relay target instead of introducing a full new mail suite immediately.

### Minimal host changes

- configure `app/.env.production` to use localhost SMTP
  - `EMAIL_PROVIDER=smtp`
  - `SMTP_HOST=127.0.0.1`
  - `SMTP_PORT=25`
- ensure the app container can reach the host relay cleanly
- send live test emails from the app test endpoint

### DNS changes required

- replace or extend SPF so it matches the actual sender path
- move DMARC beyond `p=none` once delivery is validated
- if `mail.recoder.xyz` is used publicly for SMTP identity, stop pointing it at proxied web-edge IPs
- align PTR / HELO / hostname if sending directly from the server IP

## If local Postfix is not sufficient

The next step up is Postal.

Postal is a better fit than a full mailbox suite when the goal is transactional mail only:

- queueing
- delivery visibility
- DKIM/signing management
- SMTP/API sender role

But Postal still requires the same DNS work before it becomes deliverable.
