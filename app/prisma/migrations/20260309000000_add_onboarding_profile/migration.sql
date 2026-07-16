-- Add onboarding profile data and completion timestamp
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboardingProfile" JSONB;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);
