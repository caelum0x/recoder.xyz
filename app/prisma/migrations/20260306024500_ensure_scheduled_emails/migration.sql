-- Ensure scheduled_emails exists for onboarding automation.
-- Safe for already-migrated environments.

CREATE TABLE IF NOT EXISTS "scheduled_emails" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "type" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scheduled_emails_userId_fkey'
  ) THEN
    ALTER TABLE "scheduled_emails"
      ADD CONSTRAINT "scheduled_emails_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "scheduled_emails_status_scheduledAt_idx"
  ON "scheduled_emails"("status", "scheduledAt");

CREATE INDEX IF NOT EXISTS "scheduled_emails_userId_idx"
  ON "scheduled_emails"("userId");
