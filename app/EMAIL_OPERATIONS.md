# Recoder.xyz Email Operations

This app is now SMTP-first for transactional mail.

## Provider policy

- Set `EMAIL_PROVIDER=smtp` in production.
- Use `EMAIL_PROVIDER=auto` only if you intentionally want SMTP first with Resend fallback.
- Resend is optional. It is no longer the assumed primary provider.

## Recommended sender setup

- Use a dedicated transactional sender such as `Postal` or `docker-mailserver`.
- Send from `noreply@recoder.xyz`.
- Configure:
  - `SPF`
  - `DKIM`
  - `DMARC`
  - reverse DNS / PTR for the sending IP

## Required env

- `EMAIL_PROVIDER=smtp`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `EMAIL_FROM`
- `ADMIN_SECRET`
- `CRON_SECRET`

## Operator checks

1. Verify provider status:

```bash
curl -s http://localhost:3000/api/admin/test-email \
  -H "x-admin-secret: $ADMIN_SECRET"
```

2. Send a transactional test:

```bash
curl -s http://localhost:3000/api/admin/test-email \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"email":"you@example.com","type":"verification"}'
```

3. Send an onboarding template test:

```bash
curl -s http://localhost:3000/api/admin/test-email \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"email":"you@example.com","type":"getting-started","name":"Test User"}'
```

4. Inspect cron/status without processing:

```bash
curl -s "http://localhost:3000/api/cron/process-emails?mode=status" \
  -H "x-cron-secret: $CRON_SECRET"
```

5. Run the processor manually:

```bash
curl -s -X POST http://localhost:3000/api/cron/process-emails \
  -H "x-cron-secret: $CRON_SECRET"
```

## Scheduling guidance

- Run `/api/cron/process-emails` every 15 minutes.
- Use either:
  - `x-cron-secret: $CRON_SECRET`
  - `Authorization: Bearer $CRON_SECRET`

## What to watch

- `/api/health`
  - `email.provider`
  - `email.onboardingAutomation.tableAvailable`
  - `email.onboardingAutomation.pending`
  - `email.onboardingAutomation.dueNow`
  - `email.onboardingAutomation.failed`
- `/api/admin/test-email`
  - active provider
  - onboarding pipeline counts
  - recent failures

## Notes

- Welcome email is sent inline during signup.
- Day 1 / Day 3 / Day 7 onboarding emails are persisted in `scheduled_emails`.
- If `scheduled_emails` is missing, signup still succeeds; scheduling is skipped and logged.
